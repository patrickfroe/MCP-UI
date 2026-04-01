const React = require('react');

class PostMessageTransport {
  constructor(options = {}) {
    this.options = options;
    this._messageHandler = null;
    this._listener = (event) => {
      if (this.options.targetWindow && event.source !== this.options.targetWindow) return;
      this._messageHandler?.(event.data);
    };
  }

  onMessage(handler) {
    this._messageHandler = handler;
  }

  async connect() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this._listener);
      this.send({ type: 'mcp-app:ready' });
    }
  }

  async disconnect() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this._listener);
    }
  }

  send(message) {
    if (typeof window === 'undefined') return;
    const target = this.options.targetWindow || window.parent;
    target.postMessage(message, this.options.targetOrigin || '*');
  }
}

class App {
  constructor({ transport }) {
    this.transport = transport;
    this.handlers = {};
  }

  ontoolinput(handler) { this.handlers.ontoolinput = handler; }
  ontoolresult(handler) { this.handlers.ontoolresult = handler; }
  onhostcontextchanged(handler) { this.handlers.onhostcontextchanged = handler; }
  onteardown(handler) { this.handlers.onteardown = handler; }

  async connect() {
    this.transport.onMessage((message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'mcp-app:tool-input') this.handlers.ontoolinput?.(message.payload);
      if (message.type === 'mcp-app:tool-result') this.handlers.ontoolresult?.(message.payload);
      if (message.type === 'mcp-app:host-context-changed') this.handlers.onhostcontextchanged?.(message.payload);
      if (message.type === 'mcp-app:teardown') this.handlers.onteardown?.();
    });
    await this.transport.connect();
  }

  async disconnect() {
    await this.transport.disconnect();
  }
}

function AppRenderer(props) {
  const iframeRef = React.useRef(null);

  const emitRenderData = React.useCallback(() => {
    const frame = iframeRef.current;
    if (!frame || !frame.contentWindow) return;

    const payload = {
      toolName: props.toolName,
      toolInput: props.toolInput || {},
      toolResult: props.toolResult,
      resourceUri: props.resourceUri,
    };

    frame.contentWindow.postMessage({ type: 'render-data', ...payload }, '*');
    frame.contentWindow.postMessage({ type: 'mcp-ui:render-data', payload }, '*');
  }, [props.resourceUri, props.toolInput, props.toolName, props.toolResult]);

  React.useEffect(() => {
    props.onLoad?.();
    emitRenderData();
  }, [emitRenderData, props]);

  React.useEffect(() => {
    emitRenderData();
  }, [emitRenderData]);

  React.useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data;
      props.onMessage?.(message);
      if (message && (message.type === 'mcp-ui:ready' || message.type === 'ready')) {
        emitRenderData();
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [emitRenderData, props]);

  const html = props.resourceText || '';
  return React.createElement(
    'iframe',
    {
      ref: iframeRef,
      title: props.toolName || 'mcp-widget',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms',
      style: { border: 0, width: '100%', minHeight: 240, background: 'white' },
      srcDoc: html,
    },
  );
}

module.exports = { AppRenderer, App, PostMessageTransport };
