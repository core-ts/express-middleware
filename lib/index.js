"use strict"
Object.defineProperty(exports, "__esModule", { value: true })
var stream_1 = require("stream")
var resources = (function () {
  function resources() {}
  resources.encoding = "utf-8"
  return resources
})()
exports.resources = resources
function createConfig(c) {
  if (!c) {
    return { skips: [], duration: "duration", request: "", response: "", status: "", size: "" }
  }
  var l = {
    log: c.log,
    separate: c.separate,
    skips: c.skips ? c.skips.split(",") : [],
    duration: c.duration ? c.duration : "duration",
    request: c.request ? c.request : "",
    response: c.response ? c.response : "",
    status: c.status ? c.status : "",
    size: c.size ? c.size : "",
  }
  return l
}
exports.createConfig = createConfig
function skip(skips, url) {
  if (skips.length === 0) {
    return false
  }
  var u = removeUrlParams(url)
  for (var _i = 0, skips_1 = skips; _i < skips_1.length; _i++) {
    var s = skips_1[_i]
    if (u.endsWith(s)) {
      return true
    }
  }
  return false
}
exports.skip = skip
function removeUrlParams(url) {
  var startParams = url.indexOf("?")
  return startParams !== -1 ? url.substring(0, startParams) : url
}
exports.removeUrlParams = removeUrlParams
var o = "OPTIONS"
var MiddlewareLogger = (function () {
  function MiddlewareLogger(write, conf, build) {
    this.write = write
    this.build = build
    this.log = this.log.bind(this)
    this.conf = createConfig(conf)
  }
  MiddlewareLogger.prototype.log = function (req, res, next) {
    var _this = this
    var m = req.method
    if (m !== o && this.conf.log && !skip(this.conf.skips, req.originalUrl)) {
      var start_1 = process.hrtime()
      var x_1 = this.conf.request
      var r_1 = false
      if (m !== "GET" && m !== "DELETE") {
        r_1 = true
      }
      var msg_1 = m + " " + req.originalUrl
      if (this.conf.separate && r_1) {
        if (this.conf.request.length > 0) {
          var op = {}
          op[x_1] = JSON.stringify(req.body)
          if (this.build) {
            var op2 = this.build(req, op)
            this.write(msg_1, op2)
          } else {
            this.write(msg_1, op)
          }
        }
      }
      var chunks_1 = []
      mapResponseBody(res, chunks_1)
      res.on("finish", function () {
        var duration = getDurationInMilliseconds(start_1)
        var op = {}
        if (r_1 && !_this.conf.separate && _this.conf.request.length > 0) {
          op[x_1] = JSON.stringify(req.body)
        }
        if (_this.conf.response.length > 0) {
          var rsBody = Buffer.concat(chunks_1).toString(resources.encoding)
          op[_this.conf.response] = rsBody
        }
        if (_this.conf.status.length > 0) {
          op[_this.conf.status] = res.statusCode
        }
        if (_this.conf.size.length > 0) {
          if ("_contentLength" in res) {
            op[_this.conf.size] = res["_contentLength"]
          } else if (res.hasHeader("content-length")) {
            var l = res.getHeader("content-length")
            if (typeof l === "number" || typeof l === "string") {
              op[_this.conf.size] = l
            }
          }
        }
        op[_this.conf.duration] = duration
        if (_this.build) {
          var op2 = _this.build(req, op)
          _this.write(msg_1, op2)
        } else {
          _this.write(msg_1, op)
        }
      })
      next()
    } else {
      next()
    }
  }
  return MiddlewareLogger
})()
exports.MiddlewareLogger = MiddlewareLogger
var mapResponseBody = function (res, chunks) {
  var defaultWrite = res.write.bind(res)
  var defaultEnd = res.end.bind(res)
  var ps = new stream_1.PassThrough()
  ps.on("data", function (data) {
    return chunks.push(data)
  })
  res.write = function () {
    var _a
    var args = []
    for (var _i = 0; _i < arguments.length; _i++) {
      args[_i] = arguments[_i]
    }
    ;(_a = ps).write.apply(_a, args)
    defaultWrite.apply(void 0, args)
  }
  res.end = function () {
    var args = []
    for (var _i = 0; _i < arguments.length; _i++) {
      args[_i] = arguments[_i]
    }
    ps.end.apply(ps, args)
    defaultEnd.apply(void 0, args)
  }
}
var NS_PER_SEC = 1e9
var NS_TO_MS = 1e6
var getDurationInMilliseconds = function (start) {
  var diff = process.hrtime(start)
  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS
}
var MiddlewareController = (function () {
  function MiddlewareController(logger) {
    this.logger = logger
    this.config = this.config.bind(this)
  }
  MiddlewareController.prototype.config = function (req, res) {
    var obj = req.body
    if (!obj || obj === "") {
      return res.status(400).end("The request body cannot be empty")
    }
    if (!this.logger) {
      return res.status(503).end("Logger is not available")
    }
    var changed = false
    if (obj.log !== undefined) {
      this.logger.conf.log = obj.log
      changed = true
    }
    if (obj.separate !== undefined) {
      this.logger.conf.separate = obj.separate
      changed = true
    }
    if (Array.isArray(obj.skips)) {
      if (isValidSkips(obj.skips)) {
        this.logger.conf.skips = obj.skips
        changed = true
      }
    }
    if (typeof obj.duration === "string" && obj.duration.length > 0) {
      this.logger.conf.duration = obj.duration
      changed = true
    }
    if (typeof obj.request === "string") {
      this.logger.conf.request = obj.request
      changed = true
    }
    if (typeof obj.response === "string") {
      this.logger.conf.response = obj.response
      changed = true
    }
    if (typeof obj.status === "string") {
      this.logger.conf.status = obj.status
      changed = true
    }
    if (typeof obj.size === "string") {
      this.logger.conf.size = obj.size
      changed = true
    }
    if (changed) {
      return res.status(200).json(true).end()
    } else {
      return res.status(204).json(false).end()
    }
  }
  return MiddlewareController
})()
exports.MiddlewareController = MiddlewareController
function isValidSkips(s) {
  for (var _i = 0, s_1 = s; _i < s_1.length; _i++) {
    var x = s_1[_i]
    if (!(typeof x === "string")) {
      return false
    }
  }
  return true
}
exports.isValidSkips = isValidSkips
function mask(s, start, end, replace) {
  if (start < 0) {
    start = 0
  }
  if (end < 0) {
    end = 0
  }
  var t = start + end
  if (t >= s.length) {
    return replace.repeat(s.length)
  }
  return s.substring(0, start) + replace.repeat(s.length - t) + s.substring(s.length - end)
}
exports.mask = mask
function margin(s, start, end, replace) {
  if (start >= end) {
    return ""
  }
  if (start < 0) {
    start = 0
  }
  if (end < 0) {
    end = 0
  }
  if (start >= s.length) {
    return replace.repeat(s.length)
  }
  if (end >= s.length) {
    return replace.repeat(start) + s.substring(start)
  }
  return replace.repeat(start) + s.substring(start, end - start) + replace.repeat(s.length - end)
}
exports.margin = margin
exports.maskMargin = margin
