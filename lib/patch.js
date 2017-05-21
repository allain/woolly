const { patchInPlace } = require('jiff')

module.exports = (delta, obj) => {
  return patch(delta, obj)
}
