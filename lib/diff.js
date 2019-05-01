const { diff } = require('jiff')

module.exports = (a, b) => diff(a, b).filter(p => p.op !== 'test')

