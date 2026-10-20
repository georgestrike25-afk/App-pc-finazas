import { useState } from 'react';
import { useApp } from '../store';
import { getDb } from '../../db/db';
import { softDelete } from '../../db/repo';
import { Badge, Card, confirmDialog, Empty } from '../components/ui';

const ACTION_TONE = { crear: 'ok', modificar: 'info', eliminar: 'bad', importar: 'info', restaurar: 'warn', sincronizar: 'warn' } as const;

export function HistorialPage() {
  const { data } = useApp();
  const [q, setQ] = useState('');
  const audit = data.audit.filter((a) => !q || a.summary.toLowerCase().includes(q.toLowerCase()));
  const open = async (id: string, name: string) => {
    const row = await getDb().blobs.get(id);
    if (!row) return;
    const url = URL.createObjectURL(row.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <div className="page">
      <Card title="Documentos importados">
        {data.documents.length === 0 ? (
          <Empty title="Todavía no se importaron documentos" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Archivo</th><th>Entidad</th><th>Importado</th><th>Resultado</th><th></th></tr></thead>
              <tbody>
                {[...data.documents].sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? '')).map((d) => (
                  <tr key={d.id}>
                    <td>{d.name} <small className="muted d-block">{(d.size / 1024).toFixed(0)} KB · {d.kind}</small></td>
                    <td>{d.entity ?? '—'}</td>
                    <td>{d.importedAt ? new Date(d.importedAt).toLocaleString('es-AR') : '—'}</td>
                    <td>{d.summary}</td>
                    <td className="actions">
                      {d.hasBlob && <button className="btn small" onClick={() => open(d.id, d.name)}>Descargar original</button>}
                      <button className="btn small ghost danger" onClick={async () => (await confirmDialog(`¿Eliminar el documento "${d.name}"?\nLos movimientos ya incorporados se conservan.`, { danger: true, ok: 'Eliminar' })) && softDelete('documents', d.id, `Eliminación de documento "${d.name}"`)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Registro de cambios" actions={<input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en historial" />}>
        {audit.length === 0 ? (
          <Empty title="Sin actividad registrada" />
        ) : (
          <ul className="timeline">
            {audit.map((a) => (
              <li key={a.id}>
                <Badge tone={ACTION_TONE[a.action]}>{a.action}</Badge> <strong>{new Date(a.at).toLocaleString('es-AR')}</strong> — {a.summary}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
