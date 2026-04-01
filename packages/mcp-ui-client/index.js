const React = require('react');

function AppRenderer(props) {
  React.useEffect(() => {
    props.onLoad?.();
  }, [props]);

  const html = props.resourceText || '';
  return React.createElement(
    'iframe',
    {
      title: props.toolName || 'mcp-widget',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms',
      style: { border: 0, width: '100%', minHeight: 240, background: 'white' },
      srcDoc: html,
    },
  );
}

module.exports = { AppRenderer };
