/* Forest Finance — prototipo navegable (Etapa 1). Datos de prueba ficticios; no lee ni escribe datos reales. */
(function () {
  const I = (n, cls = '') => (window.ICONS[n] || '').replace('<svg ', `<svg class="${cls}" `);
  const f0 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const f2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const $ = (n) => `$ ${f2.format(n)}`;
  const $0 = (n) => `$ ${f0.format(n)}`;
  /** Importe destacado: los centavos más chicos. */
  const big = (n, cls = '') => {
    const [e, c] = f2.format(Math.abs(n)).split(',');
    return `<div class="amount num ${cls}">${n < 0 ? '-' : ''}$ ${e}<span class="c">,${c}</span></div>`;
  };

  // ---------- Datos de prueba (ficticios) ----------
  const D = {
    nombre: 'Jorge',
    pareja: 'Antonella',
    mes: 'Octubre de 2026',
    plata: 433253.2, plataDesde: '20/10', hasta: '31/10/2026', dias: 10,
    entro: 1250000, gastaste: 821000, cuotas: 26500,
    presupuesto: 700000, diaADia: 476000,
    deuda: 81000, deudaMes: 26500, libre: 'diciembre de 2026',
    viaje: { nombre: 'Viaje de abril de 2027', costo: 3000000, ahorrado: 650000, dias: 161, porMes: 470000, aporte: 200000 },
    porDia: [0, 18500, 26300, 9800, 31200, 0, 22400, 41800, 15600, 12900, 28400, 36100, 0, 19700, 24800, 8400, 30500, 27300, 11200, 42300, 47900, 22900],
    cats: [
      ['Supermercado', 'ShoppingCart', 210000], ['Delivery y comidas', 'Utensils', 85000], ['Combustible', 'Fuel', 70000],
      ['Farmacia', 'Pill', 46000], ['Transporte', 'Bus', 35000], ['Otros', 'Shapes', 30000],
    ],
    gastos: [
      ['22/10', 'Supermercado Día', 'Supermercado', 'Débito', 42300, 50, 'ShoppingCart'],
      ['22/10', 'Panadería La Espiga', 'Delivery y comidas', 'Efectivo', 5600, 100, 'Utensils'],
      ['21/10', 'YPF', 'Combustible', 'Débito', 35000, 100, 'Fuel'],
      ['20/10', 'Farmacity', 'Farmacia', 'Ualá', 12900, 100, 'Pill'],
      ['20/10', 'Verdulería', 'Supermercado', 'Efectivo', 8500, 100, 'ShoppingCart'],
      ['19/10', 'Mercado Libre', 'Otros', 'Naranja X', 29654, 100, 'Shapes', 'Llega con el resumen'],
      ['18/10', 'Pedidos Ya', 'Delivery y comidas', 'Mercado Pago', 14200, 100, 'Utensils'],
      ['17/10', 'SUBE', 'Transporte', 'Débito', 10000, 100, 'Bus'],
    ],
  };
  const pct = Math.round((D.diaADia / D.presupuesto) * 100);
  const route = () => (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0];

  // ---------- Componentes ----------
  const card = (body, cls = '') => `<section class="card ${cls}">${body}</section>`;
  const head = (title, right = '') => `<div class="card-h"><h2>${title}</h2><div class="r">${right}</div></div>`;
  const link = (txt, href) => `<a class="card-link" href="#/${href}">${txt}${I('ChevronRight')}</a>`;
  const progress = (v, max, cls = '') => `<div class="progress ${cls}" role="progressbar" aria-valuenow="${Math.round((v / max) * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div>`;
  const ring = (p, label) => {
    const r = 52, c = 2 * Math.PI * r;
    return `<div class="ring" role="img" aria-label="${label}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--track)" stroke-width="12"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--lime)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * p) / 100} ${c}"/></svg><div class="v">${p} %</div></div>`;
  };
  const seg = (items, on) => `<nav class="seg" aria-label="Secciones">${items.map(([r, t]) => `<a href="#/${r}" class="${r === on ? 'on' : ''}">${t}</a>`).join('')}</nav>`;
  const field = (label, val, opts = {}) =>
    `<div class="field"><label>${label}</label><div class="input ${opts.cls || ''}">${opts.icon ? I(opts.icon) : ''}${opts.prefix ? `<span class="muted">${opts.prefix}</span>` : ''}<span class="val ${val ? '' : 'ph'}">${val || opts.ph || ''}</span>${opts.after ? I(opts.after) : ''}</div>${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</div>`;
  const tag = (t, cls = '') => `<span class="tag ${cls}">${t}</span>`;
  const empty = (icon, title, text, action = '') => `<div class="empty"><div class="big">${I(icon)}</div><h2>${title}</h2><p class="muted small" style="max-width:420px">${text}</p>${action}</div>`;

  /** Gastos por día (barras) con la línea del promedio que permite el presupuesto. */
  function dailyChart() {
    const W = 560, H = 240, pad = 22, n = 31, max = 50000, bw = (W - pad) / n;
    const avg = D.presupuesto / 31;
    const y = (v) => H - 20 - (v / max) * (H - 34);
    let bars = '';
    D.porDia.forEach((v, i) => {
      if (!v) return;
      bars += `<rect x="${pad + i * bw + bw * 0.2}" y="${y(v)}" width="${bw * 0.6}" height="${H - 20 - y(v)}" rx="2" fill="var(--bar)"/>`;
    });
    const ticks = [1, 5, 10, 15, 20, 25, 31].map((d) => `<text x="${pad + (d - 1) * bw + bw / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="var(--muted)">${d}</text>`).join('');
    const grid = [0, 25000, 50000].map((v) => `<line x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="0" y="${y(v) + 3}" font-size="10" fill="var(--muted)">${v / 1000}k</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos del día a día por día de octubre">${grid}${bars}<line x1="${pad}" x2="${W}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--lime)" stroke-width="2" stroke-dasharray="5 4"/>${ticks}</svg>`;
  }
  function donut(items, total) {
    const r = 46, c = 2 * Math.PI * r;
    let off = 0;
    const segs = items.map(([, , v], i) => {
      const len = (v / total) * c;
      const s = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--cat${i + 1})" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}"/>`;
      off += len;
      return s;
    }).join('');
    return `<svg viewBox="0 0 120 120" width="132" height="132" style="transform:rotate(-90deg)" role="img" aria-label="Gastos por categoría">${segs}</svg>`;
  }
  function monthsChart() {
    const m = [['may', 1180000, 1090000], ['jun', 1180000, 1210000], ['jul', 1220000, 1105000], ['ago', 1220000, 1160000], ['sep', 1250000, 1198000], ['oct', 1250000, 847500]];
    const W = 560, H = 190, max = 1400000, gw = W / m.length;
    const y = (v) => H - 22 - (v / max) * (H - 36);
    let s = '';
    m.forEach(([l, a, b], i) => {
      const x = i * gw + gw / 2;
      s += `<rect x="${x - 22}" y="${y(a)}" width="20" height="${H - 22 - y(a)}" rx="3" fill="var(--income)"/><rect x="${x + 2}" y="${y(b)}" width="20" height="${H - 22 - y(b)}" rx="3" fill="var(--bar)"/><text x="${x}" y="${H - 5}" font-size="11" text-anchor="middle" fill="var(--muted)">${l}</text>`;
    });
    return `<svg class="chart" style="height:190px" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">${s}</svg>`;
  }
  /** Ilustración plana (sin fotos externas) para la meta de viaje. */
  const scene = `<svg class="scene" viewBox="0 0 700 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><rect width="700" height="200" fill="#123c3a"/><circle cx="600" cy="58" r="20" fill="#a3e635" opacity=".85"/><path d="M0 160 L90 110 L150 135 L240 80 L330 140 L420 95 L520 135 L600 105 L700 140 V200 H0Z" fill="#1b4a47"/><path d="M0 178 L120 145 L220 170 L330 138 L450 168 L560 142 L700 160 V200 H0Z" fill="#2f6b5e"/><path d="M0 192 Q175 178 350 190 T700 186 V200 H0Z" fill="#0d2a28"/></svg>`;

  // ---------- Pantallas ----------
  const S = {};

  S.inicio = () => {
    const quedan = D.entro - D.gastaste - D.cuotas;
    return `<div class="home">
    <div class="grid g-home-1">
      ${card(`<div class="accent"></div><div class="label">Plata hasta cobrar</div>${big(D.plata, 'lg')}
        ${`<div class="bar"><i style="width:38%"></i></div>`}
        <div class="meta"><span>Hasta el <strong>${D.hasta}</strong></span><span><strong>${D.dias} días</strong></span><span><strong>${$0(Math.floor(D.plata / D.dias))}</strong> por día</span></div>
        ${link('Ver lo que se descontó', 'gastos')}`, 'hero o-1')}
      <section class="card io o-1">
        <div><div class="ic in">${I('ArrowDownToLine')}</div><div class="label">Entró</div><div class="amount md num pos">${$0(D.entro)}</div><p class="xs muted">Sueldo de octubre</p></div>
        <div><div class="ic out">${I('ArrowUpRight')}</div><div class="label">Gastaste</div><div class="amount md num neg">${$0(D.gastaste)}</div><p class="xs muted">Tu parte, sin cuotas</p></div>
      </section>
      ${card(`<div class="label">Te quedan según lo cargado</div>${big(quedan, 'md')}<p class="xs muted" style="margin-top:6px">Entró − gastaste − cuotas y préstamos (${$0(D.cuotas)})</p>${link('Ver la cuenta completa', 'detalle-del-mes')}`, 'o-3')}
    </div>
    <div class="grid g-home-2">
      ${card(`${head('Día a día en octubre')}${dailyChart()}<div class="legend" style="margin-top:8px"><span><i class="sw" style="background:var(--bar)"></i>Gastos del día</span><span><i class="sw" style="background:var(--lime)"></i>Promedio que permite el presupuesto</span></div>`, 'chart-card o-4')}
      ${card(`${head('Presupuesto del mes')}${ring(pct, `Usaste el ${pct} % del presupuesto`)}<p class="small" style="text-align:center"><strong class="num">${$0(D.diaADia)}</strong> <span class="muted">de ${$0(D.presupuesto)}</span></p><p class="xs muted" style="text-align:center">Te quedan ${$0(D.presupuesto - D.diaADia)} para comida, transporte y salidas</p>${link('Ver por categoría', 'presupuesto')}`, 'o-2')}
      ${card(`${head('Pendientes', tag('3 de 4', 'lime'))}
        <ul class="list">
          <li><span class="dot"></span><div class="grow"><div class="t">Pagar el resumen de Naranja X</div><div class="s">Vence el 10/11 · ${$(5500)}</div></div><button class="btn sm primary">Ya lo pagué</button></li>
          <li><span class="dot"></span><div class="grow"><div class="t">Cuota 4 de Préstamo personal</div><div class="s">Vence el 05/11 · ${$(23500)}</div></div>${tag('En 14 días', 'warn')}</li>
          <li><span class="dot"></span><div class="grow"><div class="t">Hacer una copia de seguridad</div><div class="s">La última fue hace 35 días</div></div><button class="btn sm">Hacer copia</button></li>
          <li><span class="dot ok">${I('Check')}</span><div class="grow"><div class="t muted">Sueldo de octubre cargado</div></div></li>
        </ul>`, 'o-2')}
    </div>
    <div class="grid g-home-3">
      ${card(`<div class="label">Deudas</div>${big(D.deuda, 'md')}<p class="xs muted" style="margin-top:6px">Este mes pagás ${$0(D.deudaMes)} · terminás en ${D.libre}</p>${link('Ver por entidad', 'deudas')}`, 'o-3')}
      <section class="card trip o-3">${scene}<div class="in"><div><div class="days">Faltan ${D.viaje.dias} días</div><h3>${D.viaje.nombre}</h3></div>
        <div><div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="amount md num" style="color:#fff">${$0(D.viaje.ahorrado)}</span><span class="small" style="color:#d9f99d">de ${$0(D.viaje.costo)} · ${Math.round((D.viaje.ahorrado / D.viaje.costo) * 100)} %</span></div>
        <div style="height:6px;background:rgba(255,255,255,.18);border-radius:999px;margin:8px 0 12px;overflow:hidden;max-width:420px"><i style="display:block;height:100%;width:22%;background:var(--lime)"></i></div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><a class="btn sm" href="#/viaje">Ver el plan</a><span class="small" style="color:#d9f99d">Para llegar, ahorrá ${$0(D.viaje.porMes)} por mes</span></div></div></div></section>
    </div></div>`;
  };

  const gastosTabs = (on) => seg([['gastos', 'Gastos'], ['ingresos', 'Ingresos'], ['compartidos', 'Compartidos'], ['presupuesto', 'Presupuesto']], on);
  const expRow = ([d, c, cat, how, v, p, ic, note]) => `<li><span class="cat">${I(ic)}</span><div class="grow"><div class="t">${c}</div><div class="s">${d} · ${cat} · ${how}${p === 50 ? ` · ${tag(`½ con ${D.pareja}`, 'lime')}` : ''}${note ? ` · ${tag(note)}` : ''}</div></div><span class="amt">${$(v * (p / 100))}</span><span class="hide-m" style="display:flex;gap:2px"><button class="btn ghost sm" aria-label="Mitad con ${D.pareja}">½</button><button class="btn ghost icon sm" aria-label="Editar ${c}">${I('Pencil')}</button><button class="btn ghost icon sm" aria-label="Eliminar ${c}" style="color:var(--expense)">${I('Trash2')}</button></span></li>`;

  S.gastos = () => {
    const tot = D.cats.reduce((a, x) => a + x[2], 0);
    return `${gastosTabs('gastos')}
    <div class="grid g-main">
      ${card(`${head('Movimientos de octubre', `<div class="pill-select hide-m">${I('Search')}Buscar</div><button class="btn primary sm hide-m">${I('Plus')}Anotar gasto</button>`)}
        <ul class="list">${D.gastos.map(expRow).join('')}</ul>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border-strong);margin-top:12px;padding-top:12px;font-weight:650"><span>Total del mes (tu parte)</span><span class="num">${$(D.gastaste)}</span></div>`)}
      ${card(`${head('Por categoría', '<span class="xs muted">Día a día</span>')}
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">${donut(D.cats, tot)}<div><div class="label">Total gastado</div><div class="amount md num">${$0(tot)}</div><div class="xs muted">${pct} % del presupuesto</div></div></div>
        <ul class="list">${D.cats.map(([n, ic, v], i) => `<li><i class="sw" style="background:var(--cat${i + 1})"></i><div class="grow t">${n}</div><span class="xs muted">${Math.round((v / tot) * 100)} %</span><span class="amt">${$0(v)}</span></li>`).join('')}</ul>`)}
    </div>
    <a class="btn primary block only-m" href="#/formulario-gasto">${I('Plus')}Anotar gasto</a>`;
  };

  S.ingresos = () => `${gastosTabs('ingresos')}
    <div class="grid g4">
      ${card(`<div class="label">Cobrado en octubre</div><div class="amount md num pos">${$0(1250000)}</div>`)}
      ${card(`<div class="label">Promedio 6 meses</div><div class="amount md num">${$0(1216667)}</div>`)}
      ${card(`<div class="label">Estado</div><div style="margin-top:6px">${tag('Confirmado', 'ok')}</div>`)}
      ${card(`<div class="label">Fecha de cobro</div><div class="amount md">01/10</div>`)}
    </div>
    ${card(`${head('Ingresos por mes', `<button class="btn primary sm">${I('Plus')}Registrar ingreso</button>`)}
      <div class="table-wrap"><table class="stack"><thead><tr><th>Mes</th><th>Concepto</th><th>Estado</th><th class="r">Neto disponible</th><th></th></tr></thead><tbody>
      ${[['Octubre de 2026', 'Sueldo', 'Confirmado', 1250000], ['Septiembre de 2026', 'Sueldo + horas extra', 'Confirmado', 1250000], ['Agosto de 2026', 'Sueldo', 'Confirmado', 1220000], ['Noviembre de 2026', 'Sueldo (previsto)', 'Estimado', 1250000]]
        .map(([m, c, e, v]) => `<tr><td><strong>${m}</strong></td><td class="muted">${c}</td><td>${tag(e, e === 'Confirmado' ? 'ok' : '')}</td><td class="r num"><strong>${$(v)}</strong></td><td class="r hide-m"><button class="btn ghost sm">Editar</button></td></tr>`).join('')}
      </tbody></table></div>`)}`;

  S.compartidos = () => `${gastosTabs('compartidos')}
    <div class="grid g3">
      ${card(`<div class="label">Total de las facturas</div><div class="amount md num">${$0(688000)}</div>`)}
      ${card(`<div class="label">Tu parte</div><div class="amount md num">${$0(344000)}</div><div class="xs muted">50 % por defecto</div>`)}
      ${card(`<div class="label">Parte de ${D.pareja}</div><div class="amount md num">${$0(344000)}</div>`)}
    </div>
    <div class="grid g-main">
      ${card(`${head('Gastos del hogar de octubre', `<button class="btn primary sm">${I('Plus')}Gasto del hogar</button>`)}
        <ul class="list">${[['Alquiler', 'House', 600000, 'Pagó Antonella · se repite cada mes'], ['Luz', 'Zap', 48000, 'Pagaste vos · bimestral'], ['Gas', 'Flame', 22000, 'Pagó Antonella'], ['Internet', 'Wifi', 18000, 'Pagaste vos · se repite cada mes']]
          .map(([c, ic, v, s]) => `<li><span class="cat">${I(ic)}</span><div class="grow"><div class="t">${c}</div><div class="s">${s}</div></div><div style="text-align:right"><div class="amt">${$(v / 2)}</div><div class="xs muted">de ${$0(v)}</div></div></li>`).join('')}</ul>`)}
      ${card(`${head('Sancor Salud')}<p class="small muted">Lo pagás con la tarjeta y ${D.pareja} te devuelve su parte.</p>
        <ul class="list" style="margin-top:12px"><li><div class="grow t">Cargo en la tarjeta</div><span class="amt">${$(250000)}</span></li><li><div class="grow t">Parte de ${D.pareja} (50 %)</div><span class="amt">${$(125000)}</span></li><li><div class="grow"><div class="t">Te devolvió</div><div class="s">18/10</div></div>${tag('Devuelto', 'ok')}</li></ul>
        <button class="btn block" style="margin-top:14px">Registrar lo que me devolvió</button>`)}
    </div>`;

  S.presupuesto = () => `${gastosTabs('presupuesto')}
    <div class="grid g3">
      ${card(`<div class="label">Presupuesto</div><div class="amount md num">${$0(D.presupuesto)}</div>`)}
      ${card(`<div class="label">Gastado</div><div class="amount md num">${$0(D.diaADia)}</div>`)}
      ${card(`<div class="label">Disponible</div><div class="amount md num pos">${$0(D.presupuesto - D.diaADia)}</div>`)}
    </div>
    <div class="grid g-main">
      ${card(`${head('Por categoría', '<span class="xs muted">Límite sugerido según tus últimos meses</span>')}
        <ul class="list">${[['Supermercado', 'ShoppingCart', 210000, 260000], ['Delivery y comidas', 'Utensils', 85000, 90000], ['Combustible', 'Fuel', 70000, 120000], ['Farmacia', 'Pill', 46000, 40000], ['Transporte', 'Bus', 35000, 60000], ['Otros', 'Shapes', 30000, 130000]]
          .map(([c, ic, v, m]) => { const p = v / m; const st = p > 1 ? ['Excedido', 'bad', 'over'] : p >= 0.85 ? ['Cerca del límite', 'warn', 'warn'] : ['Normal', 'ok', '']; return `<li style="align-items:flex-start"><span class="cat">${I(ic)}</span><div class="grow"><div style="display:flex;justify-content:space-between;gap:8px"><span class="t">${c}</span><span class="small num"><strong>${$0(v)}</strong> <span class="muted">de ${$0(m)}</span></span></div><div style="margin:8px 0 4px">${progress(v, m, st[2])}</div>${tag(st[0], st[1])}</div></li>`; }).join('')}</ul>`)}
      ${card(`${head('Presupuesto de octubre')}${ring(pct, `Usaste el ${pct} %`)}
        ${field('Monto del mes', f2.format(D.presupuesto), { prefix: '$', cls: 'right' })}
        <div class="field" style="margin-top:14px"><label>Modo del mes</label><div class="seg"><button class="on">Real</button><button>Estimado</button></div><span class="hint">Real: solo lo anotado. Estimado: completa con lo que falta gastar.</span></div>
        <label class="check" style="margin:14px 0"><span class="box on">${I('Check')}</span>Usar este monto en los meses siguientes</label>
        <button class="btn primary block">Guardar presupuesto</button>`)}
    </div>`;

  const deudasTabs = (on) => seg([['deudas', 'Por entidad'], ['cuotas', 'Cuotas'], ['prestamos-tarjetas', 'Préstamos y tarjetas']], on);
  S.deudas = () => `${deudasTabs('deudas')}
    <div class="grid g3">
      ${card(`<div class="label">Deuda total</div>${big(D.deuda, 'md')}`)}
      ${card(`<div class="label">Este mes</div><div class="amount md num">${$0(D.deudaMes)}</div><div class="xs muted">Vence el 05/11 y el 10/11</div>`)}
      ${card(`<div class="label">Libre de deudas en</div><div class="amount md">Dic 2026</div><div class="xs muted">En 2 meses</div>`)}
    </div>
    ${[['Banco Patagonia', 'Landmark', 69000, 'Préstamo personal', 'Cuota 4 de 6 · próxima 05/11', 3, 6, '23.500 por mes'], ['Naranja X', 'CreditCard', 12000, 'Tienda prueba · compra en cuotas', 'Cuota 9 de 12 · próxima 10/11', 8, 12, '3.000 por mes']]
      .map(([e, ic, v, c, s, p, t, m]) => card(`<div class="card-h"><div style="display:flex;align-items:center;gap:12px"><span class="cat">${I(ic)}</span><div><h2>${e}</h2><div class="xs muted">Último pago en diciembre de 2026</div></div></div><div class="amount md num">${$0(v)}</div></div>
        <div class="split-row"><span><strong>${c}</strong><br><span class="muted">${s}</span></span><span class="muted num">$ ${m}</span></div>
        <div style="margin-top:10px">${progress(p, t)}</div><div class="xs muted" style="margin-top:6px">${p} de ${t} cuotas pagadas</div>`)).join('')}`;

  S.cuotas = () => `${deudasTabs('cuotas')}
    ${card(`<div style="display:flex;gap:10px;align-items:center"><span class="cat" style="background:var(--warn-soft);color:var(--warn)">${I('TriangleAlert')}</span><div class="grow"><strong>Cuota 9 de Tienda prueba (Naranja X) sin pago registrado</strong><div class="xs muted">Venció el 10/10 · si ya la pagaste, marcala como pagada</div></div><button class="btn sm">Ya la pagué</button></div>`)}
    ${[['Noviembre de 2026', [['Préstamo personal · cuota 4/6', 23500], ['Tienda prueba · cuota 10/12', 3000]]], ['Diciembre de 2026', [['Préstamo personal · cuota 5/6', 23500], ['Tienda prueba · cuota 11/12', 3000]]], ['Enero de 2027', [['Préstamo personal · cuota 6/6', 22000], ['Tienda prueba · cuota 12/12', 3000]]]]
      .map(([m, xs]) => card(`${head(m, `<strong class="num">${$(xs.reduce((a, x) => a + x[1], 0))}</strong>`)}<ul class="list">${xs.map(([c, v]) => `<li><div class="grow small">${c}</div><span class="amt small">${$(v)}</span></li>`).join('')}</ul>`)).join('')}`;

  S['prestamos-tarjetas'] = () => {
    const loans = [['Préstamo personal', 'Banco Patagonia', '3/6', 4, 23500, '05/11/2026', 69000, ['Al día', 'ok']], ['Tienda prueba', 'Naranja X · compra en cuotas', '8/12', 9, 3000, '10/11/2026', 12000, ['Vencida', 'bad']]];
    const stmts = [['Naranja X', 'Octubre de 2026', '10/11/2026', 5500, 2000, ['Sin pagar', 'warn']], ['Visa Banco Patagonia', 'Septiembre de 2026', '08/10/2026', 311250, 31000, ['Pagado', 'ok']]];
    return `${deudasTabs('prestamos-tarjetas')}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${I('Plus')}Nueva deuda</button><button class="btn">Registrar pago de resumen</button></div>
    ${card(`${head('Préstamos y compras en cuotas')}
      <div class="table-wrap hide-m"><table><thead><tr><th>Concepto</th><th>Cuotas</th><th class="r">Próxima cuota</th><th>Vence</th><th class="r">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${loans.map(([c, e, q, n, v, d, sal, st]) => `<tr><td><strong>${c}</strong><div class="s">${e}</div></td><td>${q} · <span class="muted">vas por la ${n}</span></td><td class="r num">${$(v)}</td><td>${d}</td><td class="r num"><strong>${$(sal)}</strong></td><td>${tag(st[0], st[1])}</td><td class="r"><button class="btn sm">Ver cuotas</button></td></tr>`).join('')}
      </tbody></table></div>
      <ul class="list only-m">${loans.map(([c, e, q, n, v, d, sal, st]) => `<li style="align-items:flex-start"><div class="grow"><div class="t">${c}</div><div class="s">${e}</div><div class="s" style="margin-top:4px">Cuota ${n} · ${$(v)} · vence ${d.slice(0, 5)}</div></div><div style="text-align:right"><div class="amt">${$0(sal)}</div><div style="margin-top:4px">${tag(st[0], st[1])}</div></div></li>`).join('')}</ul>`)}
    ${card(`${head('Resúmenes de tarjeta')}
      <div class="table-wrap hide-m"><table><thead><tr><th>Tarjeta</th><th>Mes</th><th>Vence</th><th class="r">Total</th><th class="r">Mínimo</th><th>Pago</th></tr></thead><tbody>
      ${stmts.map(([t, m, d, v, mi, st]) => `<tr><td><strong>${t}</strong></td><td>${m}</td><td>${d}</td><td class="r num"><strong>${$(v)}</strong></td><td class="r num">${$(mi)}</td><td>${tag(st[0], st[1])}</td></tr>`).join('')}
      </tbody></table></div>
      <ul class="list only-m">${stmts.map(([t, m, d, v, mi, st]) => `<li style="align-items:flex-start"><div class="grow"><div class="t">${t}</div><div class="s">${m} · vence ${d.slice(0, 5)}</div><div class="s">Mínimo ${$(mi)}</div></div><div style="text-align:right"><div class="amt">${$(v)}</div><div style="margin-top:4px">${tag(st[0], st[1])}</div></div></li>`).join('')}</ul>`)}`;
  };

  S.viaje = () => `<div class="grid g-main">
      <div class="grid" style="gap:16px">
        <section class="card trip" style="min-height:220px">${scene}<div class="in"><div><div class="days">Faltan ${D.viaje.dias} días · abril de 2027</div><h3 style="font-size:1.4rem">${D.viaje.nombre}</h3></div><div><div style="display:flex;align-items:baseline;gap:8px"><span class="amount md num" style="color:#fff">${$0(D.viaje.ahorrado)}</span><span style="color:#d9f99d" class="small">de ${$0(D.viaje.costo)} · 22 %</span></div><div class="bar" style="height:6px;background:rgba(255,255,255,.18);border-radius:999px;margin-top:8px;overflow:hidden"><i style="display:block;height:100%;width:22%;background:var(--lime)"></i></div></div></div></section>
        ${card(`<div style="display:flex;gap:12px;align-items:flex-start"><span class="cat" style="background:var(--warn-soft);color:var(--warn)">${I('TriangleAlert')}</span><div><strong>Con lo planeado no llegás a abril de 2027</strong><p class="small muted" style="margin-top:2px">Para llegar, ahorrá <strong class="num" style="color:var(--text)">${$0(D.viaje.porMes)}</strong> por mes durante 5 meses. Hoy tenés planeado ${$0(D.viaje.aporte)}.</p></div></div>`)}
        ${card(`${head('Cuánto podés ahorrar cada mes', '<span class="xs muted">Según cuánto gastes en el día a día</span>')}<div class="table-wrap"><table><thead><tr><th>Mes</th><th class="r">Podés ahorrar</th></tr></thead><tbody>
          ${[['Noviembre', 255500, 355500, ''], ['Diciembre', 255500, 355500, ''], ['Enero', 279000, 379000, 'Termina Tienda prueba'], ['Febrero', 304500, 404500, 'Termina el préstamo']].map(([m, a, b, s]) => `<tr><td><strong>${m}</strong>${s ? `<div style="margin-top:4px">${tag(s, 'lime')}</div>` : ''}</td><td class="r num">${$0(a)} a ${$0(b)}</td></tr>`).join('')}
        </tbody></table></div>`)}
      </div>
      <div class="grid" style="gap:16px">
        ${card(`${head('Aportes', `<button class="btn primary sm">${I('Plus')}Registrar aporte</button>`)}<ul class="list">${[['15/10/2026', 200000], ['15/09/2026', 200000], ['15/08/2026', 250000]].map(([d, v]) => `<li><span class="cat">${I('PiggyBank')}</span><div class="grow t">${d}</div><span class="amt pos">+ ${$0(v)}</span></li>`).join('')}</ul>`)}
        ${card(`${head('Datos del objetivo')}<div class="grid" style="gap:14px">${field('Nombre', D.viaje.nombre)}${field('Costo estimado', f2.format(D.viaje.costo), { prefix: '$', cls: 'right' })}${field('Aporte mensual previsto', f2.format(D.viaje.aporte), { prefix: '$', cls: 'right' })}${field('Fecha objetivo', 'Abril de 2027', { after: 'Calendar' })}<button class="btn primary">Guardar objetivo</button></div>`)}
      </div>
    </div>`;

  S['detalle-del-mes'] = () => `<div class="grid g-main">
      ${card(`${head('Cómo se llega a lo que te queda')}
        <ul class="list">
          <li><div class="grow t">Entró</div><span class="amt pos">${$(D.entro)}</span></li>
          <li><div class="grow"><div class="t">Gastos fijos del hogar</div><div class="s">Tu parte de alquiler, luz, gas e internet</div></div><span class="amt">− ${$(300000)}</span></li>
          <li><div class="grow"><div class="t">Gastos personales</div><div class="s">Gimnasio, ropa</div></div><span class="amt">− ${$(45000)}</span></li>
          <li><div class="grow"><div class="t">Día a día</div><div class="s">Comida, transporte, salidas</div></div><span class="amt">− ${$(476000)}</span></li>
          <li><div class="grow"><div class="t">Cuotas y préstamos</div><div class="s">Lo que vence este mes</div></div><span class="amt">− ${$(D.cuotas)}</span></li>
          <li style="border-top:2px solid var(--text);padding-top:14px"><div class="grow"><strong>Te quedan</strong></div><span class="amt" style="font-size:1.15rem">${$(D.entro - D.gastaste - D.cuotas)}</span></li>
        </ul>`)}
      ${card(`${head('Últimos 6 meses', `<div class="legend"><span><i class="sw" style="background:var(--income)"></i>Ingresos</span><span><i class="sw" style="background:var(--bar)"></i>Gastos</span></div>`)}${monthsChart()}<p class="xs muted">Octubre todavía no terminó.</p>`)}
    </div>`;

  S.importar = () => `<div class="grid g-main">
      ${card(`${head('Subir un documento')}
        <div class="drop"><div class="big">${I('FileUp')}</div><strong>Arrastrá el archivo acá o elegilo</strong><p class="small muted">La app lo lee en este dispositivo, te muestra qué va a cargar y vos confirmás. Si lo subís dos veces, no se duplica.</p><button class="btn primary">${I('Upload')}Elegir archivo</button><div class="types">${['PDF', 'Captura', 'Video de la pantalla', 'Excel o CSV'].map((t) => tag(t)).join('')}</div></div>
        <div style="margin-top:16px;padding:14px;border:1px solid var(--border);border-radius:var(--r)"><div style="display:flex;align-items:center;gap:10px"><span class="cat">${I('FileText')}</span><div class="grow"><strong class="small">resumen-naranja-octubre.pdf</strong><div class="xs muted">Leyendo la página 2 de 3…</div></div><span class="xs muted">66 %</span></div><div style="margin-top:10px">${progress(66, 100)}</div></div>`)}
      ${card(`${head('Qué podés subir')}<ul class="list">${[['CreditCard', 'Resumen de tarjeta', 'Visa, Naranja X, Ualá'], ['Landmark', 'Cronograma de préstamo', 'PDF del banco'], ['Receipt', 'Movimientos de la cuenta', 'Captura o video del banco o billetera'], ['CalendarClock', 'Plan de pagos', 'Mercado Pago'], ['Sheet', 'Planilla de gastos compartidos', 'Excel o CSV'], ['Smartphone', 'Historial de Mis Finanzas', 'Copia JSON o CSV']]
        .map(([ic, t, s]) => `<li><span class="cat">${I(ic)}</span><div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div></li>`).join('')}</ul>`)}
    </div>`;

  S.historial = () => `${card(`${head('Registro de cambios', `<div class="pill-select">${I('Search')}Buscar en historial</div>`)}
      <ul class="list">${[['22/10 12:04', 'Registro de gasto "Supermercado Día"', 'Gasto'], ['22/10 12:05', 'Gasto a medias con Antonella: "Supermercado Día"', 'Gasto'], ['20/10 09:12', 'Plata hasta cobrar actualizada', 'Configuración'], ['18/10 21:40', 'Importación: resumen-naranja-octubre.pdf (3 gastos, 1 deuda)', 'Documento'], ['15/10 08:00', 'Aporte al viaje de $ 200.000', 'Viaje'], ['01/10 10:30', 'Sueldo de octubre cargado', 'Ingreso']]
        .map(([d, t, k]) => `<li><span class="cat">${I(k === 'Documento' ? 'FileText' : k === 'Ingreso' ? 'ArrowDownToLine' : k === 'Viaje' ? 'Plane' : k === 'Configuración' ? 'Settings' : 'Receipt')}</span><div class="grow"><div class="t">${t}</div><div class="s">${d}</div></div>${tag(k)}</li>`).join('')}</ul>`)}
    ${card(`${head('Documentos importados')}<ul class="list">${[['resumen-naranja-octubre.pdf', '18/10/2026 · Resumen de tarjeta'], ['cronograma-prestamo.pdf', '02/09/2026 · Cronograma de préstamo']].map(([n, s]) => `<li><span class="cat">${I('FileText')}</span><div class="grow"><div class="t">${n}</div><div class="s">${s}</div></div><button class="btn ghost sm">Ver</button></li>`).join('')}</ul>`)}`;

  S.configuracion = () => `<div class="grid g-main">
      <div class="grid" style="gap:16px">
        ${card(`${head('Apariencia')}<p class="small muted" style="margin-bottom:12px">Elegí cómo se ve la app en este dispositivo. Tus datos no cambian.</p>
          <div class="seg" role="radiogroup" aria-label="Tema">${[['Monitor', 'Sistema', 'system'], ['Sun', 'Claro', 'light'], ['Moon', 'Oscuro', 'dark']].map(([ic, t, v]) => `<button role="radio" data-theme-set="${v}" aria-checked="${(window.__tema || 'system') === v}" class="${(window.__tema || 'system') === v ? 'on' : ''}">${I(ic)}${t}</button>`).join('')}</div>`)}
        ${card(`${head('Preferencias')}<div class="form-grid">${field('Tu nombre y apellido', 'Jorge Agüero')}${field('Nombre de la pareja', D.pareja)}${field('Reparto de gastos del hogar (tu %)', '50', { cls: 'right' })}${field('Sancor Salud: % de la pareja', '50', { cls: 'right' })}</div><div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn primary">Guardar preferencias</button></div>`)}
        ${card(`${head('Categorías')}<div style="display:flex;gap:8px;flex-wrap:wrap">${['Supermercado', 'Delivery y comidas', 'Combustible', 'Farmacia', 'Transporte', 'Hogar', 'Salud', 'Otros'].map((c) => tag(c)).join('')}</div><div style="display:flex;gap:8px;margin-top:14px"><div style="flex:1">${field('Nueva categoría', '', { ph: 'Por ejemplo, Mascotas' })}</div><button class="btn" style="align-self:flex-end">Agregar</button></div>`)}
      </div>
      <div class="grid" style="gap:16px">
        ${card(`${head('Bloqueo con PIN')}<label class="check" style="justify-content:space-between"><span>Pedir PIN al abrir</span><span class="switch on"></span></label><p class="xs muted" style="margin-top:8px">Se bloquea tras 5 minutos en segundo plano.</p>`)}
        ${card(`${head('Notificaciones del celular')}<label class="check" style="justify-content:space-between"><span>Anotar compras automáticamente</span><span class="switch on"></span></label><p class="xs muted" style="margin-top:8px">Ualá, Mercado Pago, Naranja X, Banco Patagonia, BNA+ y Google Pay.</p>`)}
        ${card(`${head('Almacenamiento')}<div style="display:flex;gap:10px;align-items:center"><span class="cat">${I('HardDrive')}</span><div><strong class="small">Datos guardados solo en este dispositivo</strong><div class="xs muted">12,4 MB · lectura de documentos sin conexión lista</div></div></div>`)}
      </div>
    </div>`;

  S['copias-sincronizacion'] = () => `<div class="grid g2">
      ${card(`${head('Sincronizar con la PC', tag('Conectado', 'ok'))}<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><span class="cat">${I('Laptop')}</span><div><strong class="small">PC de la casa</strong><div class="xs muted">Última sincronización hace 3 minutos · Wi-Fi de la casa</div></div></div><button class="btn primary block">${I('RefreshCw')}Sincronizar ahora</button><p class="xs muted" style="margin-top:10px">Los datos viajan cifrados por tu red. No pasan por internet.</p>`)}
      ${card(`${head('Copia de seguridad')}<p class="small muted">Guardá un archivo con todos tus datos. Hacé una por mes.</p><div class="grid" style="gap:12px;margin-top:12px">${field('Contraseña (opcional)', '', { ph: 'Mínimo 8 caracteres', icon: 'Lock' })}<button class="btn primary">${I('Download')}Exportar copia</button></div><div style="border-top:1px solid var(--border);margin-top:16px;padding-top:16px"><strong class="small">Restaurar o combinar una copia</strong><p class="xs muted">Elegí el archivo y si querés reemplazar o combinar los datos.</p><button class="btn" style="margin-top:10px">Elegir archivo de copia</button></div>`)}
    </div>`;

  S.ayuda = () => `${card(`${head('Cómo usar la app')}<ol class="steps">${[['Anotá cuánta plata tenés hoy', 'En Este mes, "Plata hasta cobrar". Desde ahí se descuenta cada gasto.'], ['Subí tus resúmenes', 'Tarjetas, préstamos y planes: la app los lee y no duplica nada.'], ['Revisá Pendientes', 'Lo que falta pagar o cargar este mes, con un botón para cada cosa.'], ['Mirá cómo vas con el viaje', 'Cuánto llevás, cuánto falta y cuánto podés ahorrar por mes.']].map(([t, s], i) => `<li><span class="n">${i + 1}</span><div><strong>${t}</strong><p class="small muted">${s}</p></div></li>`).join('')}</ol><button class="btn" style="margin-top:16px">Ver la guía paso a paso</button>`)}`;

  S['primeros-pasos'] = () => `${card(`${empty('Leaf', 'Empecemos', 'La app empieza vacía. Cargá estas cuatro cosas y después solo vas a subir tus resúmenes cada mes.')}<ol class="steps" style="max-width:560px;margin:0 auto">${['Subí los cronogramas de tus préstamos', 'Subí el último resumen de cada tarjeta', 'Anotá tus gastos fijos del hogar', 'Poné cuánto cuesta tu viaje'].map((t, i) => `<li><span class="n">${i + 1}</span><div class="grow"><strong>${t}</strong></div>${I('ChevronRight')}</li>`).join('')}</ol>`)}`;

  S['gastos-vacio'] = () => `${gastosTabs('gastos')}${card(empty('Receipt', 'Sin gastos en diciembre de 2026', 'Anotá lo que pagás en efectivo o débito. Lo de la tarjeta llega solo cuando subís el resumen.', `<button class="btn primary">${I('Plus')}Anotar gasto</button>`))}`;

  const expenseForm = () => `<div class="overlay"><div class="modal full" role="dialog" aria-label="Anotar gasto">
      <div class="modal-h"><button class="btn ghost icon only-m" aria-label="Volver">${I('ArrowLeft')}</button><h2>Anotar gasto</h2><button class="btn ghost icon hide-m" aria-label="Cerrar">${I('X')}</button></div>
      <div class="modal-b">
        ${field('Cuánto', '6.400,00', { prefix: '$', cls: 'right focus' })}
        ${field('En qué', 'Panadería')}
        <div class="form-grid">${field('Categoría', 'Delivery y comidas', { icon: 'Utensils', after: 'ChevronDown' })}${field('Fecha', '22/10/2026', { after: 'Calendar' })}</div>
        <div class="field"><label>Cómo pagaste</label><div class="seg fill">${['Efectivo', 'Débito', 'Transf.', 'Tarjeta'].map((t, i) => `<button class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        <label class="check" style="justify-content:space-between;padding:12px;border:1px solid var(--border);border-radius:var(--r-sm)"><span><strong>Compartido con ${D.pareja}</strong><br><span class="xs muted">Solo cuenta tu parte</span></span><span class="switch"></span></label>
        ${field('Notas (opcional)', '', { cls: 'area', ph: 'Algo para acordarte' })}
      </div>
      <div class="modal-f"><button class="btn">Cancelar</button><button class="btn primary">Guardar gasto</button></div>
    </div></div>`;
  const confirmDel = () => `<div class="overlay"><div class="modal dialog" role="alertdialog" aria-label="Eliminar gasto"><div class="warn-ic">${I('Trash2')}</div><h2 style="font-size:1.1rem">¿Eliminar "Supermercado Día"?</h2><p class="small muted">Se quita de los gastos de octubre y deja de descontarse de tu plata. Esta acción no se puede deshacer.</p><div class="row"><button class="btn">Cancelar</button><button class="btn danger">Eliminar</button></div></div></div>`;

  // ---------- Navegación ----------
  const NAV = [
    ['inicio', 'Este mes', 'LayoutDashboard'], ['gastos', 'Gastos', 'Receipt'], ['ingresos', 'Ingresos', 'ArrowDownToLine'], ['compartidos', 'Compartidos', 'Users'], ['presupuesto', 'Presupuesto', 'PiggyBank'],
    ['deudas', 'Deudas', 'Landmark'], ['viaje', 'Viaje', 'Plane'], ['detalle-del-mes', 'Detalle del mes', 'ChartColumn'], ['importar', 'Subir documento', 'Upload'],
  ];
  const MORE = [['historial', 'Historial', 'History'], ['copias-sincronizacion', 'Copias y sincronización', 'RefreshCw'], ['configuracion', 'Configuración', 'Settings'], ['ayuda', 'Cómo usar', 'CircleHelp']];
  const TITLES = { inicio: 'Este mes', gastos: 'Gastos', ingresos: 'Ingresos', compartidos: 'Gastos compartidos', presupuesto: 'Presupuesto', deudas: 'Deudas', cuotas: 'Deudas', 'prestamos-tarjetas': 'Deudas', viaje: 'Viaje', 'detalle-del-mes': 'Detalle del mes', importar: 'Subir documento', historial: 'Historial', configuracion: 'Configuración', 'copias-sincronizacion': 'Copias y sincronización', ayuda: 'Cómo usar', 'primeros-pasos': 'Este mes', 'gastos-vacio': 'Gastos', 'formulario-gasto': 'Gastos', 'confirmar-eliminar': 'Gastos' };
  const SUBS = { inicio: `Hola, ${D.nombre}`, deudas: 'Cuánto debés y cuándo terminás', cuotas: 'Cuánto debés y cuándo terminás', 'prestamos-tarjetas': 'Cuánto debés y cuándo terminás', viaje: 'Tu meta de ahorro', importar: 'Resúmenes, cronogramas, capturas y planillas', 'detalle-del-mes': 'La cuenta completa de octubre' };
  const GROUP = { cuotas: 'deudas', 'prestamos-tarjetas': 'deudas', 'gastos-vacio': 'gastos', 'formulario-gasto': 'gastos', 'confirmar-eliminar': 'gastos', 'primeros-pasos': 'inicio' };

  function render() {
    const r = route();
    const g = GROUP[r] || r;
    const body = r === 'formulario-gasto' ? S.gastos() + expenseForm() : r === 'confirmar-eliminar' ? S.gastos() + confirmDel() : (S[r] || S.inicio)();
    const isHome = r === 'inicio' || r === 'primeros-pasos';
    const monthSel = !['configuracion', 'copias-sincronizacion', 'ayuda', 'historial', 'importar', 'viaje'].includes(r);
    const nav = (list) => list.map(([k, t, ic]) => `<a href="#/${k}" class="${g === k ? 'on' : ''}" ${g === k ? 'aria-current="page"' : ''}>${I(ic)}${t}</a>`).join('');
    const bottom = [['inicio', 'Inicio', 'LayoutDashboard'], ['gastos', 'Gastos', 'Receipt'], ['deudas', 'Deudas', 'Landmark'], ['viaje', 'Viaje', 'Plane'], ['mas', 'Más', 'Menu']];
    const bg = { ingresos: 'gastos', compartidos: 'gastos', presupuesto: 'gastos' }[g] || g;
    const inBottom = ['inicio', 'gastos', 'deudas', 'viaje'].includes(bg) ? bg : 'mas';
    document.getElementById('root').innerHTML = `
    <div class="app">
      <aside class="side" aria-label="Navegación principal">
        <div class="brand"><span class="leaf">${I('Leaf')}</span>Forest Finance</div>
        <nav class="nav">${nav(NAV)}<div class="nav-sep">Más</div>${nav(MORE)}</nav>
        <div class="side-foot"><div class="row">${I('CircleCheck')}Sincronizado con el celular</div><span class="muted">Hace 3 minutos · datos solo en tus equipos</span></div>
      </aside>
      <div class="main">
        <header class="top">
          <div class="titles"><h1>${isHome ? `Hola, ${D.nombre}` : TITLES[r]}</h1><p class="sub">${isHome ? 'Así viene tu plata en octubre' : SUBS[r] || D.mes}</p></div>
          <div class="acts">${monthSel ? `<button class="pill-select" aria-label="Elegir mes">${I('Calendar')}${D.mes}${I('ChevronDown')}</button>` : ''}${isHome ? `<a class="btn" href="#/importar">${I('Upload')}Subir documento</a><a class="btn primary" href="#/formulario-gasto">${I('Plus')}Anotar gasto</a>` : ''}</div>
        </header>
        <header class="m-top">${isHome ? `<div class="brand-m"><span class="leaf">${I('Leaf')}</span>Forest Finance</div>` : `<h1>${TITLES[r]}</h1>`}${monthSel && !isHome ? `<button class="pill-select" style="min-height:36px">${D.mes.split(' ')[0].slice(0, 3)} 26${I('ChevronDown')}</button>` : ''}<a class="btn ghost icon" href="#/importar" aria-label="Subir documento">${I('Upload')}</a></header>
        ${isHome ? `<div class="m-greet"><h1>Hola, ${D.nombre}</h1><p class="small muted">Así viene tu plata en octubre</p></div>` : ''}
        <main class="content">${body}</main>
      </div>
      <nav class="bottom" aria-label="Secciones">${bottom.map(([k, t, ic]) => `<a href="#/${k === 'mas' ? 'configuracion' : k}" class="${inBottom === k ? 'on' : ''}"><span>${I(ic)}</span>${t}</a>`).join('')}</nav>
    </div>`;
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  }
  function setTheme(t) {
    window.__tema = t;
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    render();
  }
  const q = new URLSearchParams(location.search);
  window.__tema = q.get('tema') || 'system';
  setTheme(window.__tema);
  addEventListener('hashchange', render);
})();
