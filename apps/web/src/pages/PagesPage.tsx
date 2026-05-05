import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Globe, Lock, Layout, Copy, ExternalLink, Smartphone, RefreshCw } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { timeAgo, copyText } from '@/lib/utils';

const SHARE_DURATIONS = [
  { value: '24h',   label: '24 hours',  seconds: 86_400 },
  { value: '7d',    label: '7 days',    seconds: 604_800 },
  { value: '30d',   label: '30 days',   seconds: 2_592_000 },
  { value: '90d',   label: '90 days',   seconds: 7_776_000 },
  { value: 'never', label: 'No expiry', seconds: null },
];

function expiryInfo(expiresAt?: string | null) {
  if (!expiresAt) return { text: 'No expiry', expired: false, warn: false };
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff < 0) return { text: 'Expired', expired: true, warn: false };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return { text: `Expires in ${hours}h`, expired: false, warn: true };
  if (days < 7)   return { text: `Expires in ${days}d`,  expired: false, warn: true };
  return { text: `Expires in ${days}d`, expired: false, warn: false };
}

export function PagesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [extendToken, setExtendToken] = useState<string | null>(null);
  const [extendPageId, setExtendPageId] = useState<string | null>(null);
  const [extendDuration, setExtendDuration] = useState('30d');

  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => apiClient.get('/pages').then(r => r.data.data),
  });

  const { data: sharesData, isLoading: sharesLoading } = useQuery({
    queryKey: ['shares'],
    queryFn: () => apiClient.get('/share').then(r => r.data.data ?? r.data),
  });

  const deviceShares: any[] = (sharesData ?? []).filter((s: any) => s.type === 'device');
  // Map page shareToken → share record (for expiry info)
  const pageShareMap = new Map<string, any>(
    (sharesData ?? []).filter((s: any) => s.type === 'page').map((s: any) => [s.token, s])
  );

  const createPage = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await apiClient.post('/pages', { name: 'Untitled' });
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      navigate(`/pages/${res.data._id}`);
    } catch { toast.error('Failed to create page'); }
    finally { setCreating(false); }
  };

  const deletePage = async (id: string) => {
    try {
      await apiClient.delete(`/pages/${id}`);
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      toast.success('Page deleted');
    } catch { toast.error('Failed to delete page'); }
    setDeletingId(null);
  };

  const revokeShare = async (token: string) => {
    try {
      await apiClient.delete(`/share/${token}`);
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      toast.success('Share link revoked');
    } catch { toast.error('Failed to revoke share'); }
    setRevokingToken(null);
  };

  const extendDeviceShare = async () => {
    if (!extendToken) return;
    const opt = SHARE_DURATIONS.find(o => o.value === extendDuration);
    try {
      await apiClient.patch(`/share/${extendToken}`, { expiresSeconds: opt?.seconds ?? null });
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      toast.success('Expiry updated');
    } catch { toast.error('Failed to update expiry'); }
    setExtendToken(null);
  };

  const republishPage = async (pageId: string) => {
    const opt = SHARE_DURATIONS.find(o => o.value === extendDuration);
    try {
      await apiClient.post(`/pages/${pageId}/publish`, { expiresSeconds: opt?.seconds ?? null });
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      toast.success('Page link extended');
    } catch { toast.error('Failed to extend page link'); }
    setExtendPageId(null);
  };

  const copyShareLink = async (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    await copyText(url);
    toast.success('Link copied!');
  };

  const isLoading = pagesLoading || sharesLoading;

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Page Builder</div>
          <h1>Pages</h1>
          <p className="lede">Build pages with drag-and-drop widgets and publish them as live public links.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 20 }}>
          <button className="btn btn-primary" style={{ gap: 6 }} onClick={createPage} disabled={creating}>
            <Plus size={13} /> {creating ? 'Creating…' : 'New page'}
          </button>
        </div>
      </div>

      {/* ── Builder pages ── */}
      <div className="eyebrow" style={{ marginBottom: 16, marginTop: 8 }}>Builder pages</div>
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 140 }} />)}
        </div>
      ) : (pagesData ?? []).length === 0 ? (
        <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', marginBottom: 40 }}>
          <Layout size={32} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p className="dim" style={{ fontSize: 14 }}>No pages yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
          {/* New page card */}
          <button
            onClick={createPage}
            disabled={creating}
            style={{
              padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, minHeight: 140, border: '1px dashed hsl(var(--border))', background: 'transparent',
              cursor: 'pointer', color: 'hsl(var(--muted-fg))', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--primary))'; (e.currentTarget as HTMLElement).style.color = 'hsl(var(--primary))'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--border))'; (e.currentTarget as HTMLElement).style.color = 'hsl(var(--muted-fg))'; }}
          >
            <Plus size={20} />
            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>New page</span>
          </button>

          {(pagesData ?? []).map((page: any) => {
            const pageShare = page.shareToken ? pageShareMap.get(page.shareToken) : null;
            const exp = pageShare ? expiryInfo(pageShare.expiresAt) : null;
            const borderColor = !page.shareToken
              ? 'hsl(var(--border))'
              : exp?.expired ? 'hsl(var(--bad))' : exp?.warn ? 'hsl(var(--warn))' : 'hsl(var(--good))';
            return (
            <div
              key={page._id}
              className="panel"
              style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderLeft: `3px solid ${borderColor}` }}
            >
              <div style={{ padding: '20px 20px 16px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1 }}>{page.name}</div>
                    {page.description && <p className="dim" style={{ fontSize: 12, marginTop: 4 }}>{page.description}</p>}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: !page.shareToken ? 'hsl(var(--muted-fg))' : exp?.expired ? 'hsl(var(--bad))' : exp?.warn ? 'hsl(var(--warn))' : 'hsl(var(--good))' }}>
                    {page.shareToken ? <Globe size={11} /> : <Lock size={11} />}
                    {!page.shareToken ? 'Private' : exp?.expired ? 'Expired' : 'Published'}
                  </span>
                </div>
                <div className="mono faint" style={{ fontSize: 10.5 }}>
                  {page.widgets?.length ?? 0} widget{page.widgets?.length !== 1 ? 's' : ''} · {timeAgo(page.createdAt)}
                  {exp && <span style={{ color: exp.expired ? 'hsl(var(--bad))' : exp.warn ? 'hsl(var(--warn))' : undefined }}> · {exp.text}</span>}
                </div>

                {page.shareToken && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    {!exp?.expired && (
                      <>
                        <button onClick={() => copyShareLink(page.shareToken)} className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 10.5 }}>
                          <Copy size={10} /> Copy link
                        </button>
                        <a href={`/s/${page.shareToken}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 10.5 }}>
                          <ExternalLink size={10} /> View
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => { setExtendPageId(page._id); setExtendDuration('30d'); }}
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, fontSize: 10.5, color: exp?.expired ? 'hsl(var(--primary))' : undefined }}
                    >
                      <RefreshCw size={10} /> {exp?.expired ? 'Reshare' : 'Extend'}
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', borderTop: '1px solid hsl(var(--rule-ghost))' }}>
                <Link to={`/pages/${page._id}`} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', gap: 4, borderRadius: 0 }}>
                  <Pencil size={11} /> Edit
                </Link>
                <button
                  onClick={() => setDeletingId(page._id)}
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, justifyContent: 'center', gap: 4, color: 'hsl(var(--bad))', borderRadius: 0, borderLeft: '1px solid hsl(var(--rule-ghost))' }}
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          );})}
        </div>
      )}

      {/* ── Published device shares ── */}
      {deviceShares.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Published device shares</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {deviceShares.map((share: any) => {
              const exp = expiryInfo(share.expiresAt);
              return (
              <div key={share._id} className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderLeft: `3px solid ${exp.expired ? 'hsl(var(--bad))' : exp.warn ? 'hsl(var(--warn))' : 'hsl(var(--good))'}` }}>
                <div style={{ padding: '18px 20px 14px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Smartphone size={13} style={{ color: 'hsl(var(--muted-fg))' }} />
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1 }}>
                        {share.label || share.resourceId || 'Device share'}
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: exp.expired ? 'hsl(var(--bad))' : exp.warn ? 'hsl(var(--warn))' : 'hsl(var(--good))' }}>
                      <Globe size={10} /> {exp.expired ? 'Expired' : 'Live'}
                    </span>
                  </div>
                  <div className="mono faint" style={{ fontSize: 10 }}>
                    Sections: {(share.sections ?? []).join(', ')} · {timeAgo(share.createdAt)}
                  </div>
                  <div className="mono" style={{ fontSize: 10, marginTop: 3, color: exp.expired ? 'hsl(var(--bad))' : exp.warn ? 'hsl(var(--warn))' : 'hsl(var(--muted-fg))' }}>
                    {exp.text}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {!exp.expired && (
                      <>
                        <button onClick={() => copyShareLink(share.token)} className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 10.5 }}>
                          <Copy size={10} /> Copy link
                        </button>
                        <a href={`/s/${share.token}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 10.5 }}>
                          <ExternalLink size={10} /> View
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => { setExtendToken(share.token); setExtendDuration('30d'); }}
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, fontSize: 10.5, color: exp.expired ? 'hsl(var(--primary))' : undefined }}
                    >
                      <RefreshCw size={10} /> {exp.expired ? 'Reshare' : 'Extend'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', borderTop: '1px solid hsl(var(--rule-ghost))' }}>
                  <button
                    onClick={() => setRevokingToken(share.token)}
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1, justifyContent: 'center', gap: 4, color: 'hsl(var(--bad))', borderRadius: 0 }}
                  >
                    <Trash2 size={11} /> Revoke
                  </button>
                </div>
              </div>
            );})}
          </div>
        </>
      )}

      {deletingId && (
        <ConfirmModal
          title="Delete page"
          message="This will permanently delete the page and revoke any public share links."
          confirmLabel="Delete"
          danger
          onConfirm={() => deletePage(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}

      {revokingToken && (
        <ConfirmModal
          title="Revoke share link"
          message="This will permanently disable the public link. Anyone with the link will see a 404."
          confirmLabel="Revoke"
          danger
          onConfirm={() => revokeShare(revokingToken)}
          onCancel={() => setRevokingToken(null)}
        />
      )}

      {/* Extend device share expiry */}
      {extendToken && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setExtendToken(null)}>
          <div style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', padding: '28px 28px 24px', maxWidth: 360, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 6 }}>Extend share link</div>
            <p className="dim" style={{ fontSize: 13, marginBottom: 20 }}>Set a new expiry for this device share. The existing link stays the same.</p>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>New expiry</label>
            <select value={extendDuration} onChange={e => setExtendDuration(e.target.value)} className="input" style={{ width: '100%', marginBottom: 20 }}>
              {SHARE_DURATIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={extendDeviceShare}>Confirm</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setExtendToken(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Extend / republish page share expiry */}
      {extendPageId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setExtendPageId(null)}>
          <div style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', padding: '28px 28px 24px', maxWidth: 360, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 6 }}>Extend page link</div>
            <p className="dim" style={{ fontSize: 13, marginBottom: 20 }}>Set a new expiry for this page's public link. The URL stays the same.</p>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>New expiry</label>
            <select value={extendDuration} onChange={e => setExtendDuration(e.target.value)} className="input" style={{ width: '100%', marginBottom: 20 }}>
              {SHARE_DURATIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => republishPage(extendPageId)}>Confirm</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setExtendPageId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
