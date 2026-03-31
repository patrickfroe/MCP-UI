const React = require('react');

function AppRenderer(props) {
  React.useEffect(() => {
    props.onLoad?.();
  }, [props]);

  return React.createElement(
    'div',
    { style: { border: '1px dashed #94a3b8', padding: '12px', borderRadius: '8px' } },
    React.createElement('div', { style: { fontWeight: 600, marginBottom: 8 } }, 'AppRenderer Placeholder (local shim)'),
    React.createElement('div', null, `resourceUri: ${props.resourceUri || ''}`),
    React.createElement('pre', { style: { fontSize: 12, overflow: 'auto', maxHeight: 180 } }, props.resourceText || ''),
  );
}

module.exports = { AppRenderer };
