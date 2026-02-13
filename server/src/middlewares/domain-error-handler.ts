import { NextFunction, Request, Response } from 'express'
import { Primitives } from '../utils/Primitives'

export abstract class DomainError extends Error {
  abstract readonly errorName: string
  abstract readonly description: string
  abstract readonly statusCode: number
  constructor(public readonly params: Record<string, unknown> = {}) {
    super()
  }

  toPrimitives(): Primitives<DomainError> {
    return {
      errorName: this.errorName,
      description: this.description,
      statusCode: this.statusCode,
      params: this.params,
      name: this.name,
      message: this.message
    }
  }
}

export function domainErrorHandler(err: unknown, _: Request, res: Response, next: NextFunction) {
  if (err instanceof DomainError) {
    const { errorName, description, statusCode, params } = err.toPrimitives()
    return res.status(statusCode).json({
      errorName,
      description,
      details: params
    })
  }

  console.error(err)
  return res.status(500).json({ error: 'InternalServerError', message: 'Something went wrong' })
}
