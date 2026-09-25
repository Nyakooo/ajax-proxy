export function typeIs(value) {
  return {
    '[object String]': 'string',
    '[object Number]': 'number',
    '[object Boolean]': 'boolean',
    '[object Symbol]': 'symbol',
    '[object Undefined]': 'undefined',
    '[object Null]': 'null',
    '[object Function]': 'function',
    '[object Date]': 'date',
    '[object Array]': 'array',
    '[object Object]': 'object',
    '[object Map]': 'map',
    '[object Set]': 'set',
    '[object RegExp]': 'regexp',
    '[object Error]': 'error',
  }[Object.prototype.toString.call(value)]
}

export function deepClone(value) {
  if (['string', 'boolean', 'undefined', 'number'].includes(typeof value)) {
    return value
  }
  return JSON.parse(JSON.stringify(value))
}

export function arrayToObject(key, values = []) {
  return values.reduce((result, value) => {
    if (value[key]) result[value[key]] = value
    return result
  }, {})
}
