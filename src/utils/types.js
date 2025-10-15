export function setTypeData(el, obj) {
    const t1 = (obj?.type1 || '').toString().trim().toLowerCase();
    const t2 = (obj?.type2 || '').toString().trim().toLowerCase() || t1;
    if (t1) el.setAttribute('data-type1', t1); else el.removeAttribute('data-type1');
    if (t2) el.setAttribute('data-type2', t2); else el.removeAttribute('data-type2');
  }
  