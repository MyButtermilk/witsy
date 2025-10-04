import { IncomingMessage, ServerResponse, createServer as defaultCreateServer } from 'node:http'
import * as portfinder from 'portfinder'
import * as path from 'node:path'
import * as fs from 'node:fs'

export type RequestHandler = (req: IncomingMessage, res: ServerResponse, parsedUrl: URL) => Promise<void> | void

/**
 * Unified HTTP server for all callback/webhook needs in the application
 */
export class HttpServer {
  private static instance: HttpServer | null = null
  private server: any = null
  private port: number | null = null
  private routes: Map<string, RequestHandler> = new Map()
  private createServer: typeof defaultCreateServer

  private constructor(createServer: typeof defaultCreateServer = defaultCreateServer) {
    this.createServer = createServer
  }

  /**
   * Get the singleton instance of the HTTP server
   */
  static getInstance(createServer?: typeof defaultCreateServer): HttpServer {
    if (!HttpServer.instance) {
      HttpServer.instance = new HttpServer(createServer)
    }
    return HttpServer.instance
  }

  /**
   * Get the port the server is running on
   */
  getPort(): number | null {
    return this.port
  }

  /**
   * Get the base URL of the server
   */
  getBaseUrl(): string {
    if (this.port) {
      return `http://localhost:${this.port}`
    }
    throw new Error('HTTP server is not running')
  }

  /**
   * Register a route handler
   * @param path The path to handle (e.g., '/oauth/callback')
   * @param handler The request handler function
   * @throws Error if path already exists
   */
  register(path: string, handler: RequestHandler): void {
    if (this.routes.has(path)) {
      throw new Error(`Path conflict: Route '${path}' already registered`)
    }
    this.routes.set(path, handler)
    console.log(`📝 Registered HTTP route: ${path}`)
  }

  /**
   * Unregister a route handler
   * @param path The path to unregister
   */
  unregister(path: string): void {
    if (this.routes.delete(path)) {
      console.log(`🗑️ Unregistered HTTP route: ${path}`)
    }
  }

  /**
   * Ensure the HTTP server is running
   */
  async ensureServerRunning(): Promise<void> {

    if (this.server) {
      return
    }

    // Find an available port starting from 8090
    this.port = await portfinder.getPortPromise({ port: 8090 })
    console.log(`🚀 Starting HTTP server on port ${this.port}...`)
    
    this.server = this.createServer((req, res) => {
      
      // Ignore favicon requests
      if (req.url === '/favicon.ico') {
        res.writeHead(404)
        res.end()
        return
      }

      // Process logo request
      if (req.url === '/logo.png') {
        const assetsFolder = process.env.DEBUG ? 'assets' : process.resourcesPath;
        const fileData = fs.readFileSync(path.join(assetsFolder, 'icon.png'));
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.write(fileData);
        res.end();
        return;
      }

      console.log(`📥 Received HTTP request: ${req.method} ${req.url}`)
      
      try {
        const parsedUrl = new URL(req.url || '/', `http://localhost:${this.port}`)
        const path = parsedUrl.pathname

        // Find matching route handler
        const handler = this.routes.get(path)
        
        if (handler) {
          console.log(`✅ Found handler for path: ${path}`)
          // Execute the handler
          const result = handler(req, res, parsedUrl)
          
          // If handler returns a promise, handle it
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error(`❌ Handler error for path ${path}:`, error)
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' })
                res.end('Internal Server Error')
              }
            })
          }
        } else {
          console.log(`❌ No handler found for path: ${path}`)
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not Found')
        }
      } catch (error) {
        console.error('❌ HTTP server error:', error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal Server Error')
        }
      }
    })

    this.server.listen(this.port, () => {
      console.log(`✅ HTTP server listening on http://localhost:${this.port}`)
    })

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${this.port} is already in use - HTTP server may already be running`)
      } else {
        console.error('❌ HTTP server error:', err)
      }
    })
  }

  /**
   * Shutdown the HTTP server
   * @private Internal method for testing/cleanup
   */
  private shutdown(): void {
    if (this.server) {
      console.log('🛑 Shutting down HTTP server')
      this.server.close()
      this.server = null
      this.port = null
      this.routes.clear()
    }
  }

  /**
   * Get all registered routes (for debugging/testing)
   */
  getRegisteredRoutes(): string[] {
    return Array.from(this.routes.keys())
  }
}