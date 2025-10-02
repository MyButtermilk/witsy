
import { OAuthClientProvider, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { OAuthClientInformation, OAuthClientInformationFull, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { app, App, shell } from 'electron'
import { createServer as defaultCreateServer } from 'node:http'
import { useI18n } from '../main/i18n'
import * as portfinder from 'portfinder'

export type OnTokensUpdatedCallback = (tokens: OAuthTokens, scope: string) => void

export class McpOAuthClientProvider implements OAuthClientProvider {
  private _codeVerifier?: string
  private _redirectUrl: string | URL
  private _clientMetadata: OAuthClientMetadata
  private _onRedirect: (url: URL) => void
  private _onTokensUpdated: OnTokensUpdatedCallback
  private _clientInformation?: OAuthClientInformationFull
  private _tokens?: OAuthTokens

  constructor(
    redirectUrl: string | URL, 
    clientMetadata: OAuthClientMetadata,
    onRedirect: (url: URL) => void,
    onTokensUpdated: OnTokensUpdatedCallback
  ) {
    this._redirectUrl = redirectUrl
    this._clientMetadata = clientMetadata
    this._onRedirect = onRedirect
    this._onTokensUpdated = onTokensUpdated
  }

  get redirectUrl(): string | URL {
    return this._redirectUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens
    this._onTokensUpdated(tokens, this.clientMetadata.scope || '')
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this._onRedirect(authorizationUrl)
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('No code verifier saved')
    }
    return this._codeVerifier
  }

}

/**
 * OAuth flow manager for MCP servers
 */
// Global OAuth callback server singleton
class OAuthCallbackServer {

  private static instance: OAuthCallbackServer | null = null
  private server: any = null
  private port: number | null = null
  private pendingCallbacks: Map<string, { resolve: (code: string) => void, reject: (error: Error) => void, timeout: NodeJS.Timeout }> = new Map()
  private createServer: typeof defaultCreateServer

  get callbackPort(): number | null {
    return this.port
  }

  private constructor(createServer: typeof defaultCreateServer = defaultCreateServer) {
    this.createServer = createServer
  }

  static getInstance(createServer?: typeof defaultCreateServer): OAuthCallbackServer {
    if (!OAuthCallbackServer.instance) {
      OAuthCallbackServer.instance = new OAuthCallbackServer(createServer)
    }
    return OAuthCallbackServer.instance
  }

  async waitForCallback(flowId: string): Promise<string> {
    // Start server if not already running (outside the Promise)
    await this.ensureServerRunning()
    
    return new Promise<string>((resolve, reject) => {
      // Set up timeout for this specific flow
      const timeout = setTimeout(() => {
        console.log(`[OAuth] OAuth callback timeout for flow ${flowId}`)
        this.pendingCallbacks.delete(flowId)
        reject(new Error('OAuth callback timeout'))
        
        // // If no more pending callbacks, shutdown server
        // if (this.pendingCallbacks.size === 0) {
        //   this.shutdown()
        // }
      }, 300000) // 5 minute timeout

      // Store the callback handlers
      console.log(`[OAuth] Storing pending callback for flowId: ${flowId}...`)
      this.pendingCallbacks.set(flowId, { resolve, reject, timeout })
    })
  }

  async ensureServerRunning(): Promise<void> {
    if (this.server) {
      console.log('[OAuth] OAuth callback server already running, reusing...')
      return
    }

    // localization
    const t = useI18n(app);

    // Find an available port starting from 8090
    this.port = await portfinder.getPortPromise({ port: 8090 })
    console.log(`[OAuth] Starting OAuth callback server on port ${this.port}...`)
    this.server = this.createServer((req, res) => {

      // Ignore favicon requests
      if (req.url === '/favicon.ico') {
        res.writeHead(404)
        res.end()
        return
      }

      console.log(`[OAuth] Received OAuth callback: ${req.url}`)
      const parsedUrl = new URL(req.url || '', 'http://localhost')
      const code = parsedUrl.searchParams.get('code')
      const error = parsedUrl.searchParams.get('error')
      const state = parsedUrl.searchParams.get('state') || 'default' // Use state to identify flow

      const pendingCallback = this.pendingCallbacks.get(state)
      
      if (code && pendingCallback) {
        console.log(`[OAuth] Authorization code received for flow ${state}: ${code?.substring(0, 10)}...`)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>OAuth Authorization Successful</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 60px 20px; background: rgb(252, 250, 248); color: black; text-align: center; min-height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding-top: 12.5%; }
                .logo { width: 8rem; height: 8rem; margin-bottom: 2rem;   transform: rotate(5deg); }
                h1 { font-size: 28pt; font-weight: 600; margin: 0 0 1rem 0; }
                p { font-size: 16pt; opacity: 0.8; margin: 0; line-height: 1.5; }
              </style>
            </head>
            <body>
              <img src="https://witsy.bonamy.fr/img/logo.png" alt="Witsy" class="logo">
              <h1>${t('mcp.oauth.success.title')}</h1>
              <p>${t('mcp.oauth.success.message')}</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `)

        // Clean up this specific callback
        clearTimeout(pendingCallback.timeout)
        this.pendingCallbacks.delete(state)
        pendingCallback.resolve(code)

        // If no more pending callbacks, shutdown server after a delay
        // if (this.pendingCallbacks.size === 0) {
        //   setTimeout(() => this.shutdown(), 30000)
        // }
      } else if (error) {
        console.log(`[OAuth] Authorization error for flow ${state}: ${error}`)
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>OAuth Authorization Failed</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 60px 20px; background: #0f172a; color: #ffffff; text-align: center; min-height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; }
                .logo { width: 64px; height: 64px; margin-bottom: 32px; }
                h1 { font-size: 28px; font-weight: 600; margin: 0 0 16px 0; color: #ef4444; }
                p { font-size: 16px; opacity: 0.8; margin: 0; line-height: 1.5; }
              </style>
            </head>
            <body>
              <img src="https://witsy.bonamy.fr/img/logo.png" alt="Witsy" class="logo">
              <h1 data-i18n="oauth.error.title">Authorization Failed</h1>
              <p data-i18n="oauth.error.message">Error: ${error}</p>
            </body>
          </html>
        `)

        if (pendingCallback) {
          clearTimeout(pendingCallback.timeout)
          this.pendingCallbacks.delete(state)
          pendingCallback.reject(new Error(`OAuth authorization failed: ${error}`))
        }

        // If no more pending callbacks, shutdown server
        // if (this.pendingCallbacks.size === 0) {
        //   setTimeout(() => this.shutdown(), 30000)
        // }
      } else {
        console.log(`[OAuth] Invalid OAuth callback: no code, state or error parameter or pendingCallback not found: code: ${code}, state: ${state}, error: ${error}`)
        res.writeHead(400)
        res.end('Bad request')

        if (pendingCallback) {
          clearTimeout(pendingCallback.timeout)
          this.pendingCallbacks.delete(state)
          pendingCallback.reject(new Error('No authorization code provided'))
        }
      }
    })

    this.server.listen(this.port, () => {
      console.log(`[OAuth] OAuth callback server listening on http://localhost:${this.port}`)
    })

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[OAuth] Port ${this.port} is already in use - OAuth callback server may already be running`)
      } else {
        console.error('[OAuth] OAuth callback server error:', err)
      }
    })
  }

  private shutdown(): void {
    if (this.server) {
      console.log('[OAuth] Shutting down OAuth callback server')
      this.server.close()
      this.server = null
      
      // Clean up any remaining callbacks
      for (const [flowId, callback] of this.pendingCallbacks) {
        clearTimeout(callback.timeout)
        callback.reject(new Error(`OAuth server shutdown (flow ${flowId})`))
      }
      this.pendingCallbacks.clear()
    }
  }
}

export default class McpOAuthManager {
  private app: App
  private client: Client | null = null
  private serverUrl: string = ''
  private callbackServer: OAuthCallbackServer
  
  constructor(app: App) {
    this.app = app
    this.callbackServer = OAuthCallbackServer.getInstance()
  }

  async getClientMetadata(scope?: string): Promise<OAuthClientMetadata> {
    
    // Ensure server is running to get the port
    await this.callbackServer.ensureServerRunning()
    const callbackUrl = `http://localhost:${this.callbackServer.callbackPort}/callback`
    
    return {
      client_name: `${useI18n(app)('common.appName')} MCP Client`,
      redirect_uris: [callbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      ...(scope ? { scope } : {})
    }
  }

  /**
   * Detect if a server requires OAuth by attempting to connect
   */
  async detectOAuth(url: string, headers: Record<string, string>): Promise<{ requiresOAuth: boolean, metadata?: OAuthClientMetadata }> {
    try {

      // prepare transport options
      const transportOptions: any = {
        requestInit: {
          headers: headers,
        }
      }
      
      // Try to connect to the server without OAuth to see if it's required
      const testTransport = new StreamableHTTPClientTransport(new URL(url), transportOptions)
      const testClient = new Client({
        name: 'witsy-oauth-detection',
        version: '1.0.0'
      }, {
        capabilities: {}
      })

      try {
        await testClient.connect(testTransport)
        await testClient.close()
        // If connection succeeds, OAuth is not required
        return { requiresOAuth: false }
      } catch (error) {
        // Check if this is an OAuth-related error
        const isOAuthError = this.isOAuthRequiredError(error)
        
        if (isOAuthError) {
          // OAuth is required - provide standardized Witsy client metadata
          const scope = await this.getServerSupportedScopes(url)
          const clientMetadata = await this.getClientMetadata(scope)
          console.log(`OAuth required for ${url}:`, error.message)
          return { requiresOAuth: true, metadata: clientMetadata }
        } else {
          // Some other error - re-throw
          throw error
        }
      }
    } catch (error) {
      console.error(`Failed to detect OAuth requirement for ${url}:`, error)
      throw error
    }
  }

  /**
   * Check if an error indicates OAuth is required
   */
  isOAuthRequiredError(error: any): boolean {
    // Check for UnauthorizedError from MCP SDK
    if (error instanceof UnauthorizedError) {
      return true
    }

    // Check for HTTP 401 errors with OAuth-specific messages
    const errorMessage = error?.message || ''
    const lowerMessage = errorMessage.toLowerCase()
    
    // Treat dynamic client registration errors as OAuth requirement
    if (lowerMessage.includes('dynamic client registration') ||
        lowerMessage.includes('does not support dynamic client registration')) {
      return true
    }
    
    // Look for OAuth-specific error patterns
    if (lowerMessage.includes('http 401') && (
      lowerMessage.includes('invalid_token') ||
      lowerMessage.includes('missing') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('authentication required')
    )) {
      return true
    }

    // Check for common OAuth error responses
    if (lowerMessage.includes('invalid_token') || 
        lowerMessage.includes('access_denied') ||
        lowerMessage.includes('insufficient_scope')) {
      return true
    }

    return false
  }

  /**
   * Opens the authorization URL in the user's default browser
   */
  private async openBrowser(url: string): Promise<void> {
    console.log(`[OAuth] Opening browser for authorization: ${url}`);

    // Use shell.openExternal for Electron instead of exec for cross-platform compatibility
    shell.openExternal(url);
  }

  /**
   * Start OAuth authorization flow - simplified to match reference implementation
   */
  async startOAuthFlow(
    url: string, 
    clientMetadata: OAuthClientMetadata,
    clientCredentials?: { client_id: string; client_secret: string }
  ): Promise<string> {
    console.log(`[OAuth] Attempting to connect to ${url}...`);
    this.serverUrl = url;
    
    // Generate unique flow ID for this OAuth attempt
    const flowId = `oauth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    console.log(`[OAuth] OAuth flow ID: ${flowId}`)
    
    console.log('[OAuth] Creating OAuth provider...');
    const callbackUrl = `http://localhost:${this.callbackServer.callbackPort}/callback`
    const oauthProvider = new McpOAuthClientProvider(
      callbackUrl,
      clientMetadata,
      (redirectUrl: URL) => {
        // Add state parameter to identify this specific flow
        const urlWithState = new URL(redirectUrl.toString())
        urlWithState.searchParams.set('state', flowId)
        
        console.log(`[OAuth] OAuth redirect handler called - opening browser`);
        console.log(`Opening browser to: ${urlWithState.toString()}`);
        this.openBrowser(urlWithState.toString());
      },
      () => {}
    );
    
    // Set client credentials if provided (for servers that don't support dynamic registration)
    if (clientCredentials) {
      console.log('[OAuth] Using provided client credentials');
      const clientInformation = {
        client_id: clientCredentials.client_id,
        client_secret: clientCredentials.client_secret,
        redirect_uris: [callbackUrl],
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: `${useI18n(app)('common.appName')} MCP Client`,
      }
      oauthProvider.saveClientInformation(clientInformation);
    }
    
    console.log('[OAuth] OAuth provider created');

    console.log('[OAuth] Creating MCP client...');
    this.client = new Client({
      name: `${useI18n(app)('common.appName').toLowerCase()}-oauth-client`,
      version: '1.0.0',
    }, { capabilities: {} });
    console.log('[OAuth] Client created');

    console.log('[OAuth] Starting OAuth flow...');
    await this.attemptConnection(oauthProvider, flowId);
    
    // Return the OAuth configuration with tokens
    const tokens = oauthProvider.tokens();
    return JSON.stringify({
      clientMetadata,
      tokens,
      clientInformation: oauthProvider.clientInformation()
    });
  }

  /**
   * Attempt connection - matches reference implementation exactly
   */
  private async attemptConnection(oauthProvider: McpOAuthClientProvider, flowId: string): Promise<void> {
    console.log('[OAuth] Creating transport with OAuth provider...');
    const baseUrl = new URL(this.serverUrl);
    const transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: oauthProvider
    });
    console.log('[OAuth] Transport created');

    try {
      console.log('[OAuth] Attempting connection (this will trigger OAuth redirect)...');
      await this.client!.connect(transport);
      console.log('[OAuth] Connected successfully');
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        console.log('[OAuth] OAuth required - waiting for authorization...');
        const authCode = await this.callbackServer.waitForCallback(flowId);
        await transport.finishAuth(authCode);
        console.log('[OAuth] Authorization code received:', authCode);
        console.log('[OAuth] Reconnecting with authenticated transport...');
        await this.attemptConnection(oauthProvider, flowId);
      } else {
        console.error('[OAuth] Connection failed with non-auth error:', error);
        throw error;
      }
    }
  }


  /**
   * Complete OAuth flow with authorization code - for test compatibility
   */
  async completeOAuthFlow(serverUuid: string, authorizationCode: string): Promise<boolean> {
    console.log(`Completing OAuth flow for server ${serverUuid} with code: ${authorizationCode.substring(0, 10)}...`)
    return false
  }


  /**
   * Create an OAuth provider for a server - simplified
   */
  async createOAuthProvider(
    clientMetadata: OAuthClientMetadata, 
    onRedirect: (url: URL) => void,
    onTokensUpdated: OnTokensUpdatedCallback
  ): Promise<McpOAuthClientProvider> {
    
    const redirectUrl = clientMetadata.redirect_uris?.[0] || `http://localhost:${this.callbackServer.callbackPort}/callback`
    return new McpOAuthClientProvider(redirectUrl, clientMetadata, onRedirect, onTokensUpdated)
  }

  shutdown(): void {
  }

  async getServerSupportedScopes(url: string): Promise<string | null> {

    try {

      // get metadata url (.well-known/oauth-protected-resource)
      let response = await fetch(url)
      const headers = response.headers
      const auth = headers.get('www-authenticate')
      if (!auth) return null
      
      // parse the header
      let resourceMetadata = null
      const parts = auth.split(',')
      for (const part of parts) {
        const [key, value] = part.trim().split('=')
        if (key === 'resource_metadata' && value) {
          resourceMetadata = value.replace(/"/g, '')
          break
        }
      }

      // if none
      if (!resourceMetadata) {
        return null
      }

      // now fetch it
      response = await fetch(resourceMetadata)
      if (!response.ok) {
        console.error(`Failed to fetch resource metadata from ${resourceMetadata}: ${response.status} ${response.statusText}`)
        return null
      }
      const json = await response.json()
      if (json.scopes_supported && Array.isArray(json.scopes_supported)) {
        return json.scopes_supported.join(' ')
      }

    } catch (error) {
      console.error('Failed to get server supported scopes:', url, error)
    }

    // too bad
    return null

  }

}