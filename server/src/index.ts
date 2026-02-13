import { Server } from './Server'

async function bootstrap() {
  const server = new Server()
  await server.start()
}

bootstrap().catch(error => {
  console.error('❌ Failed to start server', error)
  process.exit(1)
})
