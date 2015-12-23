var os = require('os')
var path = require('path')
var rimraf = require('rimraf')
var blobs = require('content-addressable-blob-store')
var level = require('level-browserify')
var cache = require('../')

var blobPath = path.join((os.tmpdir || os.tmpDir)(), 'cache-blob-store-test-store')
var levelPath = path.join((os.tmpdir || os.tmpDir)(), 'cache-blob-store-test-metadb')
var metaDb

var common = {
  setup: function (t, cb) {
    // make a new blobs instance on every test
    metaDb = level(levelPath)
    cb(null, cache({
      store: blobs(blobPath),
      metaDb: metaDb
    }))
  },
  teardown: function (t, store, blob, cb) {
    metaDb.close(function (err) {
      if (err) console.error('teardown error', err)
      rimraf(levelPath, function () {
        rimraf(blobPath, cb)
      })
    })
  }
}

module.exports = common
