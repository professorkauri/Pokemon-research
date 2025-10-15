export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(props || {})) {
      if (k === 'className') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v === false || v == null) continue;
      else node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c == null) continue;
      if (c instanceof Node) node.appendChild(c);
      else node.appendChild(document.createTextNode(String(c)));
    }
    return node;
  }
  
  export function clear(node) { node.innerHTML = ''; return node; }
  