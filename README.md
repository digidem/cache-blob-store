# cache-blob-store

[![Build Status](https://travis-ci.org/digidem/cache-blob-store.svg)](https://travis-ci.org/digidem/cache-blob-store)

`cache-blob-store` is
  designed for caching online resources (mainly images) for offline web
  apps. It uses an
  [abstract-blob-store](https://github.com/maxogden/abstract-blob-store)
  compatible store for storing blobs (images) and implements and
  `abstract-blob-store` compatible interface itself. On top of the
  `abstract-blob-store` API it adds additional helper methods for
  downloading a resource to the store and creating an
  [ObjectUrl](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL)
  for an image in the cache

[![blob-store-compatible](https://raw.githubusercontent.com/maxogden/abstract-blob-store/master/badge.png)](https://github.com/maxogden/abstract-blob-store)

## var cache = new Cache(opts)

Creates a new instance of a `cache-blob-store`.

**Parameters**

-   `opts` **Object**
    -   `opts.urlTransform` **function** Transforms the url before storing as a
          key. Default transform removes protocol and numbered sub-domains (for map
          tiles which are duplicated across numbered subdomains)
    -   `opts.store` **Object** Instance of an
          [abstract-blob-store](https://github.com/maxogden/abstract-blob-store).
          Defaults to
          [idb-content-addressable-blob-store](https://github.com/substack/idb-content-addressable-blob-store)
          in the browser and
          [content-addressable-blob-store](https://github.com/mafintosh/content-addressable-blob-store)
          in node / electron (data stored under `./cache-store`).
          Content-addressable stores are preferable, but it should work with any
          abstract-blob-store
    -   `opts.metaDb` **Object** Levelup db - defaults to level-js in the
          browser, in node / electron saves db to `./cache-metadb`

## Caching helper methods

### cache.download(opts, cb)

Download a resource and store it in the cache

**Parameters**

-   `url` **string**
-   `cb` **Function** called with `err, metadata`

### cache.getObjectURL(url, cb)

Returns an
  [ObjectUrl](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL)
  for an image in the cache

**Parameters**

-   `url` **string** Url to the image resource
-   `cb` **Function** called with `err, url` where `url` is an URL
      representing the image object in the cache. Should be revoked with
      `URL.revokeObjectUrl(url)` when no longer needed (i.e. when the Image has
      loaded)

### cache.get(url, cb)

Get a resource (e.g. image) from the cache

**Parameters**

-   `url` **string** Url to the resource
-   `cb` **Function** called with `err, blob` where `blob` will have `type`
      content-type defined from the URL file extension if an image, or metadata
      `content-type` stored when the resource was added to the cache

### cache.put(opts, blob, cb)

Store a resource (e.g. image) in the cache

**Parameters**

-   `opts` **string or Object** String url key, or options object with
      required `key` and optional metadata. `content-type` metadata will be
      parsed from the `blob`
    -   `opts.key` **string** url key of the resource to cache
-   `blob` **Blob** Image / blob data
-   `cb` **Function** called with `err, metadata` when finished

## abstract-blob-store compatible methods

### cache.createReadStream(opts)

Open a read stream to a blob in the store for url key

**Parameters**

-   `opts` **string or Object** String url key, or options object with
      `key` property

### cache.createWriteStream(opts, cb)

Create a writable stream to add a new blob to the store. Expects a string
  url key for the resource, or an object with required property `key` and
  optional metadata from resource headers, such as `content-type` (jpg, png
  and webp content types are guessed from their extension)

**Parameters**

-   `opts` **string or Object** String url key, or options object with
      required `key` and optional metadata
    -   `opts.key` **string** url key of the resource to cache
-   `cb` **Function** Called when stream has finished writing with `err,
      metadata`

### cache.exists(opts, cb)

Check if `opts.key` exists with `cb(err, exists)`

**Parameters**

-   `opts` **string or Object** String key or object with property `key`
-   `cb` **Function** `cb(err, exists)` where `exists` is boolean

### cache.remove(opts, cb)

Remove an image from the cache for `url`

**Parameters**

-   `opts` **string or Object** String url key, or options object with
      required `key` and optional metadata. `content-type` metadata will be
      parsed from the `blob`
    -   `opts.key` **string** url key of the resource to cache
-   `cb` **Function** called with `err`

