import { NextFunction } from "express"
import { ParamsDictionary, Request, Response } from "express-serve-static-core"
import { ParsedQs } from "qs"
import { PassThrough } from "stream"

// tslint:disable-next-line:class-name
export class resources {
  static encoding?: BufferEncoding = "utf-8"
}

export interface LogConf {
  log?: boolean
  separate?: boolean
  skips?: string
  request?: string
  response?: string
  duration?: string
  status?: string
  size?: string
}
export interface MiddleLog {
  log?: boolean
  separate?: boolean
  skips: string[]
  duration: string
  request: string
  response: string
  status: string
  size: string
}
export interface SimpleMap {
  [key: string]: string | number | boolean | Date
}
export function createConfig(c?: LogConf): MiddleLog {
  if (!c) {
    return { skips: [], duration: "duration", request: "", response: "", status: "", size: "" }
  }
  const l: MiddleLog = {
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
export function skip(skips: string[], url: string): boolean {
  if (skips.length === 0) {
    return false
  }
  const u = removeUrlParams(url)
  for (const s of skips) {
    if (u.endsWith(s)) {
      return true
    }
  }
  return false
}
export function removeUrlParams(url: string): string {
  const startParams = url.indexOf("?")
  return startParams !== -1 ? url.substring(0, startParams) : url
}
export interface Middleware {
  conf: MiddleLog
}
const o = "OPTIONS"
export class MiddlewareLogger {
  constructor(
    public write: (msg: string, m?: SimpleMap) => void,
    conf?: LogConf,
    public build?: (req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>, m: SimpleMap) => SimpleMap,
  ) {
    this.log = this.log.bind(this)
    this.conf = createConfig(conf)
  }
  conf: MiddleLog
  log(req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>, next: NextFunction) {
    const m = req.method
    if (m !== o && this.conf.log && !skip(this.conf.skips, req.originalUrl)) {
      const start = process.hrtime()
      const x = this.conf.request
      let r = false
      if (m !== "GET" && m !== "DELETE") {
        r = true
      }
      const msg = `${m} ${req.originalUrl}`
      if (this.conf.separate && r) {
        if (this.conf.request.length > 0) {
          const op: SimpleMap = {}
          op[x] = JSON.stringify(req.body)
          if (this.build) {
            const op2 = this.build(req, op)
            this.write(msg, op2)
          } else {
            this.write(msg, op)
          }
        }
      }
      const chunks: Uint8Array[] = []
      mapResponseBody(res, chunks)
      res.on("finish", () => {
        const duration = getDurationInMilliseconds(start)
        const op: SimpleMap = {}
        if (r && !this.conf.separate && this.conf.request.length > 0) {
          op[x] = JSON.stringify(req.body)
        }
        if (this.conf.response.length > 0) {
          const rsBody = Buffer.concat(chunks).toString(resources.encoding)
          op[this.conf.response] = rsBody
        }
        if (this.conf.status.length > 0) {
          op[this.conf.status] = res.statusCode
        }
        if (this.conf.size.length > 0) {
          if ("_contentLength" in res) {
            op[this.conf.size] = (res as any)["_contentLength"]
          } else if (res.hasHeader("content-length")) {
            const l = res.getHeader("content-length")
            if (typeof l === "number" || typeof l === "string") {
              op[this.conf.size] = l
            }
          }
        }
        op[this.conf.duration] = duration
        if (this.build) {
          const op2 = this.build(req, op)
          this.write(msg, op2)
        } else {
          this.write(msg, op)
        }
      })
      next()
    } else {
      next()
    }
  }
}
const mapResponseBody = (res: Response<any, Record<string, any>, number>, chunks: Uint8Array[]) => {
  const defaultWrite = res.write.bind(res)
  const defaultEnd = res.end.bind(res)
  const ps = new PassThrough()

  ps.on("data", (data: any) => chunks.push(data))
  ;(res as any).write = (...args: any) => {
    ;(ps as any).write(...args)
    ;(defaultWrite as any)(...args)
  }
  ;(res as any).end = (...args: any) => {
    ps.end(...args)
    defaultEnd(...args)
  }
}
const NS_PER_SEC = 1e9
const NS_TO_MS = 1e6
const getDurationInMilliseconds = (start: [number, number] | undefined) => {
  const diff = process.hrtime(start)
  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS
}

// tslint:disable-next-line:max-classes-per-file
export class MiddlewareController {
  constructor(public logger: Middleware) {
    this.config = this.config.bind(this)
  }
  config(req: Request, res: Response) {
    const obj: MiddleLog = req.body
    if (!obj || (obj as any) === "") {
      return res.status(400).end("The request body cannot be empty")
    }
    if (!this.logger) {
      return res.status(503).end("Logger is not available")
    }
    let changed = false
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
}
export function isValidSkips(s: string[]): boolean {
  for (const x of s) {
    if (!(typeof x === "string")) {
      return false
    }
  }
  return true
}
export function mask(s: string, start: number, end: number, replace: string): string {
  if (start < 0) {
    start = 0
  }
  if (end < 0) {
    end = 0
  }
  const t = start + end
  if (t >= s.length) {
    return replace.repeat(s.length)
  }
  return s.substring(0, start) + replace.repeat(s.length - t) + s.substring(s.length - end)
}
export function margin(s: string, start: number, end: number, replace: string): string {
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
export const maskMargin = margin

export interface NumberMap {
  [key: string]: number
}
export interface LogConfig {
  level?: string
  map?: LogMapConfig
  constants?: SimpleMap
  name?: Name
}
export interface LogMapConfig {
  time?: string
  level?: string
  msg?: string
}
export interface LogMap {
  time: string
  level: string
  msg: string
}
export interface Name {
  trace: string
  debug: string
  info: string
  warn: string
  error: string
  panic: string
  fatal: string
}
export interface Logger {
  name: Name
  level: number
  map: LogMap
  constants?: SimpleMap
  trace(msg: string, m?: SimpleMap, ctx?: any): void
  debug(msg: string, m?: SimpleMap, ctx?: any): void
  info(msg: string, m?: SimpleMap, ctx?: any): void
  warn(msg: string, m?: SimpleMap, ctx?: any): void
  error(msg: string, m?: SimpleMap, ctx?: any): void
  panic(msg: string, m?: SimpleMap, ctx?: any): void
  fatal(msg: string, m?: SimpleMap, ctx?: any): void
  isLevelEnabled(level: number): boolean
  isTraceEnabled(): boolean
  isDebugEnabled(): boolean
  isInfoEnabled(): boolean
  isWarnEnabled(): boolean
  isErrorEnabled(): boolean
  isPanicEnabled(): boolean
  isFatalEnabled(): boolean
}
export const map: NumberMap = {
  TRACE: -2,
  DEBUG: -1,
  INFO: 0,
  WARN: 1,
  ERROR: 2,
  PANIC: 3,
  FATAL: 4,
}
export class LogController {
  map: NumberMap
  update: (logger: Logger, obj: LogConfig, mp: NumberMap) => boolean
  constructor(public logger: Logger, updateL?: (logger: Logger, obj: LogConfig, mp: NumberMap) => boolean, mp?: NumberMap) {
    this.map = mp ? mp : map
    this.update = updateL ? updateL : updateLog
    this.config = this.config.bind(this)
  }
  config(req: Request, res: Response) {
    const obj: LogConfig = req.body
    if (!obj || (obj as any) === "") {
      return res.status(400).end("The request body cannot be empty")
    }
    if (!this.logger) {
      return res.status(503).end("Logger is not available")
    }
    if (typeof obj.level === "string" && obj.level.length > 0) {
      if (!this.map) {
        return res.status(503).end("Map is not available")
      }
    }
    const changed = this.update(this.logger, obj, this.map)
    if (changed) {
      return res.status(200).json(true).end()
    } else {
      return res.status(204).json(false).end()
    }
  }
}
export function updateLog(logger: Logger, obj: LogConfig, mp: NumberMap): boolean {
  let changed = false
  if (typeof obj.level === "string" && obj.level.length > 0) {
    const lv = mp[obj.level.toUpperCase()]
    if (lv !== undefined) {
      logger.level = lv
      changed = true
    }
  }
  if (obj.map) {
    if (typeof obj.map.level === "string" && obj.map.level.length > 0) {
      logger.map.level = obj.map.level
      changed = true
    }
    if (typeof obj.map.time === "string" && obj.map.time.length > 0) {
      logger.map.time = obj.map.time
      changed = true
    }
    if (typeof obj.map.msg === "string" && obj.map.msg.length > 0) {
      logger.map.msg = obj.map.msg
      changed = true
    }
  }
  if (obj.constants !== undefined && typeof obj.constants === "object") {
    const ks = Object.keys(obj.constants)
    if (ks.length > 0) {
      logger.constants = obj.constants
    } else {
      logger.constants = undefined
    }
    changed = true
  }
  if (obj.name) {
    if (
      typeof obj.name.trace === "string" &&
      typeof obj.name.debug === "string" &&
      typeof obj.name.info === "string" &&
      typeof obj.name.warn === "string" &&
      typeof obj.name.error === "string" &&
      typeof obj.name.panic === "string" &&
      typeof obj.name.fatal === "string"
    ) {
      logger.name = obj.name
      changed = true
    }
  }
  return changed
}
