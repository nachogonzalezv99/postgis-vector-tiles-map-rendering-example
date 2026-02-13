import compression from 'compression'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import { domainErrorHandler } from './middlewares/domain-error-handler'
import polygonRoutes from './routes/polygons'
import activityRoutes from './routes/activities'

dotenv.config({ debug: false })

export class Server {
  private readonly app: express.Express

  constructor() {
    this.app = express()
  }

  async start(): Promise<void> {
    this.configurePreMiddlewares()
    this.configureRoutes()
    this.configurePostMiddlewares()

    this.app.listen(process.env.PORT, () => {
      console.log(`🚀 Server running on http://localhost:${process.env.PORT}`)
    })
  }

  async stop() {}

  private configurePreMiddlewares(): void {
    this.app.use(cors())
    this.app.use(express.json())
    this.app.use(compression())

    const app = express()
  }

  private configurePostMiddlewares(): void {
    this.app.use(domainErrorHandler)
  }

  private configureRoutes() {
    this.app.use('/polygons', polygonRoutes)
    this.app.use('/activities', activityRoutes)
  }
}
