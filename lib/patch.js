const { patchInPlace } = require('jiff')

module.exports = (delta, obj) => {
  return patchInPlace(delta, obj)
}
