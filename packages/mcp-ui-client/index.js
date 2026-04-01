const React = require('react');

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

module.exports = { AppRenderer };
