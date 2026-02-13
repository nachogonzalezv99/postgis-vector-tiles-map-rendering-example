import { RequestHandler } from 'express'
import z from 'zod'
import { DomainError } from './domain-error-handler'

class InvalidRequestError extends DomainError {
  readonly errorName = 'RequestValidationError'
  readonly description: string
  readonly statusCode: number = 422

  constructor(errors: z.core.$ZodIssue[]) {
    super({ errors })
    this.description = 'Invalid or missing inputs'
  }
}

type RequestSchema = z.ZodObject<{
  body?: z.ZodObject
  query?: z.ZodObject
  params?: z.ZodObject
}>

export function validateSchema<S extends RequestSchema>(schema: S) {
  type Params = z.infer<typeof schema>['params']
  type Body = z.infer<typeof schema>['body']
  type Query = z.infer<typeof schema>['query']

  const handler: RequestHandler<Params, any, Body, Query> = async (req, _, next) => {
    try {
      await schema.parseAsync(req)
      next()
    } catch (error) {
      if (error instanceof z.ZodError) next(new InvalidRequestError(error.issues))
      else next(new InvalidRequestError([]))
    }
  }
  return handler as RequestHandler<Params, any, Body, Query>
}
