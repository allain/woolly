const { patch } = require('jiff')

module.exports = (delta, obj) => {
  return patch(delta, obj)
}