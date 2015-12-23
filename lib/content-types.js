var extname = require('path').extname

var contentTypes = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff'
}

module.exports = function lookup (path) {
  if (!path || typeof path !== 'string') {
    return false
  }

  // get the extension ('ext' or '.ext' or full path)
  var extension = extname('x.' + path)
    .toLowerCase()
    .substr(1)

  return contentTypes[extension] || false
}
