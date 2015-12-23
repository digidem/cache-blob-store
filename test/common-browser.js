var cache = require('../')

var common = {
  setup: function (t, cb) {
    cb(null, cache())
  },
  teardown: function (t, store, blob, cb) {
    if (blob) return store.remove(blob, cb)
    cb()
  }
}

module.exports = common
