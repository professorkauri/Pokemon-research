export function setTypeData(el, obj) {
  //Normal Cards
  if (obj?.type1) {
    const t1 = (obj?.type1 || '').toString().trim().toLowerCase();
    const t2 = (obj?.type2 || '').toString().trim().toLowerCase() || t1;
    if (t1) el.setAttribute('data-type1', t1); else el.removeAttribute('data-type1');
    if (t2) el.setAttribute('data-type2', t2); else el.removeAttribute('data-type2');
  } else {
    //Notepad Overlay
    const t1 = (obj?.pType1 || '').toString().trim().toLowerCase();
    const t2 = (obj?.pType2 || '').toString().trim().toLowerCase() || t1;
    if (t1) el.setAttribute('data-type1', t1); else el.removeAttribute('data-type1');
    if (t2) el.setAttribute('data-type2', t2); else el.removeAttribute('data-type2');
  }
}
