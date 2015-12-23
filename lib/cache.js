/* globals URL,Blob */
var through = require('through2')
var readonly = require('read-only-stream')
var btoa = require('btoa-lite')
var toBuffer = require('blob-to-buffer')
var collect = require('collect-stream')
var level = require('level-browserify')
var defaults = require('levelup-defaults')
var assign = require('object-assign')
var http = require('http')

var urlTransform = require('./url-transform')
var guessContentType = require('./content-types')

var noop = function () {}

/**
 * Creates a new instance of a `cache-blob-store`. `cache-blob-store` is
 *   designed for caching online resources (mainly images) for offline web
 *   apps. It uses an
 *   [abstract-blob-store](https://github.com/maxogden/abstract-blob-store)
 *   compatible store for storing blobs (images) and implements and
 *   `abstract-blob-store` compatible interface itself. On top of the
 *   `abstract-blob-store` API it adds additional helper methods for
 *   downloading a resource to the store and creating an
 *   [ObjectUrl](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL)
 *   for an image in the cache
 * @class
 *
 * @param {Object} opts
 * @param {function} opts.urlTransform Transforms the url before storing as a
 *   key. Default transform removes protocol and numbered sub-domains (for map
 *   tiles which are duplicated across numbered subdomains)
 * @param {Object} opts.store Instance of an
 *   [abstract-blob-store](https://github.com/maxogden/abstract-blob-store).
 *   Defaults to
 *   [idb-content-addressable-blob-store](https://github.com/substack/idb-content-addressable-blob-store)
 *   in the browser and
 *   [content-addressable-blob-store](https://github.com/mafintosh/content-addressable-blob-store)
 *   in node / electron (data stored under `./cache-store`).
 *   Content-addressable stores are preferable, but it should work with any
 *   abstract-blob-store
 * @param {Object} opts.metaDb Levelup db - defaults to level-js in the
 *   browser, in node / electron saves db to `./cache-metadb`
 */
function Cache (opts) {
  if (!(this instanceof Cache)) return new Cache(opts)
  opts = opts || {}
  this._urlTransform = (typeof opts.urlTransform === 'function') ? opts.urlTransform : urlTransform
  this._store = opts.store || require('./store')
  if (opts.metaDb) {
    this._metaDb = defaults(opts.metaDb, {valueEncoding: 'json'})
  } else {
    this._metaDb = level('./cache-metadb', {valueEncoding: 'json'})
  }
}

/** @alias Cache.prototype */
var CacheProto = Cache.prototype

/**
 * Check if `opts.key` exists with `cb(err, exists)`
 * @param {string|Object} opts String key or object with property `key`
 * @param {Function} cb        `cb(err, exists)` where `exists` is boolean
 */
CacheProto.exists = function (opts, cb) {
  if (typeof opts === 'string') opts = {key: opts}
  opts = opts || {}
  var url = typeof opts.key === 'string' ? opts.key : 'undefined'
  this._getMetadata(url, function (err, metadata) {
    if (err && err.notFound) return cb(null, false)
    else if (err) return cb(err)
    cb(null, !!metadata && !!metadata.key)
  })
}

/**
 * Create a writable stream to add a new blob to the store. Expects a string
 *   url key for the resource, or an object with required property `key` and
 *   optional metadata from resource headers, such as `content-type` (jpg, png
 *   and webp content types are guessed from their extension)
 * @param {string|Object}   opts String url key, or options object with
 *   required `key` and optional metadata
 * @param {string} opts.key url key of the resource to cache
 * @param {Function} cb   Called when stream has finished writing with `err,
 *   metadata`
 */
CacheProto.createWriteStream = function (opts, cb) {
  var self = this
  if (typeof opts === 'string') opts = {key: opts}
  opts = opts || {}
  var url = typeof opts.key === 'string' ? opts.key : 'undefined'
  // storeKey is ignored by content-addressable blob stores
  var storeKey = btoa(self._urlTransform(url))
  var ws = self._store.createWriteStream(storeKey, function (err, metadata) {
    if (err) return cb(err)
    metadata = assign({}, opts, metadata)
    self._putMetadata(url, metadata, function (err) {
      if (err) return cb(err)
      metadata.key = url
      cb(null, metadata)
    })
  })
  return ws
}

/**
 * Open a read stream to a blob in the store for url key
 * @param {string|Object} opts String url key, or options object with
 *   `key` property
 */
CacheProto.createReadStream = function (opts) {
  if (typeof opts === 'string') opts = {key: opts}
  opts = opts || {}
  var url = typeof opts.key === 'string' ? opts.key : 'undefined'
  var store = this._store
  var stream = through()
  this._getMetadata(url, function (err, metadata) {
    if (err) stream.emit('error', err)
    else if (metadata && metadata.key) {
      var rs = store.createReadStream(metadata.key)
      rs.on('error', function (err) { stream.emit('error', err) })
      rs.pipe(stream)
    }
    else stream.emit('error', new Error('key not found: ' + url))
  })
  return readonly(stream)
}

/**
 * Remove an image from the cache for `url`
 * @param {string}   url
 * @param {Function} cb  called with `err`
 */
CacheProto.remove = function (opts, cb) {
  var self = this
  if (!cb) cb = noop
  if (typeof opts === 'string') opts = {key: opts}
  opts = opts || {}
  var url = typeof opts.key === 'string' ? opts.key : 'undefined'
  var metaKey = self._urlTransform(url)
  self._metaDb.get(metaKey, function (err, metadata) {
    if (err && err.notFound) return cb(null)
    else if (err) return cb(err)
    var key = metadata && metadata.key
    if (!key) return cb(null)
    self._metaDb.del(metaKey, function (metaErr) {
      self._store.remove(key, function (err) {
        cb(metaErr || err)
      })
    })
  })
}

/**
 * Store a resource (e.g. image) in the cache
 * @param {string|Object}   opts String url key, or options object with
 *   required `key` and optional metadata. `content-type` metadata will be
 *   parsed from the `blob`
 * @param {string} opts.key url key of the resource to cache
 * @param {Blob}     blob  Image / blob data
 * @param {Function} cb    called with `err, metadata` when finished
 */
CacheProto.put = function (opts, blob, cb) {
  if (typeof opts === 'string') opts = {key: opts}
  opts = opts || {}
  var url = typeof opts.key === 'string' ? opts.key : 'undefined'
  if (!(blob instanceof Blob)) {
    throw new Error('expected blob')
  }
  var metadata = assign({}, opts, {'content-type': blob.type})
  var self = this
  var buf = toBuffer(blob)
  self.createWriteStream(opts).end(buf, function (err, blobStoreMetadata) {
    if (err) return cb(err)
    self._putMetadata(url, metadata, function (errMeta) {
      assign(blobStoreMetadata, metadata)
      cb(err || errMeta, blobStoreMetadata)
    })
  })
}

/**
 * Get a resource (e.g. image) from the cache
 * @param {string}   url Url to the resource
 * @param {Function} cb  called with `err, blob` where `blob` will have `type`
 *   content-type defined from the URL file extension if an image, or metadata
 *   `content-type` stored when the resource was added to the cache
 */
CacheProto.get = function (url, cb) {
  var self = this
  collect(self.createReadStream(url), function (err, buf) {
    self._getContentType(url, function (errMeta, contentType) {
      if (err || errMeta) return cb(err || errMeta)
      var blob = new Blob([buf], {type: contentType})
      cb(null, blob)
    })
  })
}

/**
 * Download a resource and store it in the cache
 * @param {string}   url
 * @param {Function} cb  called with `err, metadata`
 */
CacheProto.download = function (url, cb) {
  var self = this
  http.get(url, function (res) {
    res.on('error', cb)
    var opts = assign({}, res.headers, {key: url})
    var ws = self.createWriteStream(opts, cb)
    res.pipe(ws)
  }).on('error', cb)
}

/**
 * Returns an
 *   [ObjectUrl](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL)
 *   for an image in the cache
 * @param {string}   url Url to the image resource
 * @param {Function} cb  called with `err, url` where `url` is an URL
 *   representing the image object in the cache. Should be revoked with
 *   `URL.revokeObjectUrl(url)` when no longer needed (i.e. when the Image has
 *   loaded)
 */
CacheProto.getObjectURL = function (url, cb) {
  this.get(url, function (err, blob) {
    if (err) return cb(err)
    var objectUrl = URL.createObjectURL(blob)
    cb(null, objectUrl)
  })
}

CacheProto._getMetadata = function (url, cb) {
  var key = this._urlTransform(url)
  this._metaDb.get(key, cb)
}

CacheProto._putMetadata = function (url, metadata, cb) {
  var key = this._urlTransform(url)
  this._metaDb.put(key, metadata, cb)
}

CacheProto._getContentType = function (url, cb) {
  var contentType = guessContentType(url)
  if (contentType) return cb(null, contentType)
  this._getMetadata(url, function (err, metadata) {
    if (err && err.notFound) {
      return cb(null, 'application/octet-stream')
    } else if (err) {
      return cb(err)
    }
    cb(null, metadata['content-type'])
  })
}

module.exports = Cache
