import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Globe, Lock, Layout, Copy, ExternalLink, Smartphone } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { timeAgo, copyText } from '@/lib/utils';

export function PagesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => apiClient.get('/pages').then(r => r.data.data),
  });

  const { data: sharesData, isLoading: sharesLoading } = useQuery({
    queryKey: ['shares'],
    queryFn: () => apiClient.get('/share').then(r => r.data.data ?? r.data),
  });

  const deviceShares: any[] = (sharesData ?? []).filter((s: any) => s.type === 'device');

  const createPage = async () => {
    if (!newName.trim()) return;
    try {
      const res = await apiClient.post('/pages', { name: newName.trim() });
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      setCreating(false);
      setNewName('');
      navigate(`/pages/${res.data._id}`);
    } catch { toast.error('Failed to create page'); }
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
          <h1>Pages <em>& Dashboards</em></h1>
          <p className="lede">Build custom dashboards with drag-and-drop widgets. Publish to a public link.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 20 }}>
          <button className="btn btn-primary" style={{ gap: 6 }} onClick={() => setCreating(true)}>
            <Plus size={13} /> New page
          </button>
        </div>
      </div>

      {creating && (
        <div className="panel" style={{ padding: 20, marginBottom: 24, borderTop: '2px solid hsl(var(--primary))' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>New page</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              autoFocus
              className="input"
              placeholder="Fleet Overview"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createPage(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
              style={{ flex: 1 }}
            />
            <button onClick={createPage} disabled={!newName.trim()} className="btn btn-primary btn-sm">Create</button>
            <button onClick={() => { setCreating(false); setNewName(''); }} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

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
          {(pagesData ?? []).map((page: any) => (
            <div key={page._id} className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 20px 16px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1 }}>{page.name}</div>
                    {page.description && <p className="dim" style={{ fontSize: 12, marginTop: 4 }}>{page.description}</p>}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: page.shareToken ? 'hsl(var(--good))' : 'hsl(var(--muted-fg))' }}>
                    {page.shareToken ? <Globe size={11} /> : <Lock size={11} />}
                    {page.shareToken ? 'Published' : 'Private'}
                  </span>
                </div>
                <div className="mono faint" style={{ fontSize: 10.5 }}>
                  {page.widgets?.length ?? 0} widget{page.widgets?.length !== 1 ? 's' : ''} · {timeAgo(page.createdAt)}
                </div>

                {/* Published action row */}
                {page.shareToken && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <button
                      onClick={() => copyShareLink(page.shareToken)}
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, fontSize: 10.5 }}
                    >
                      <Copy size={10} /> Copy link
                    </button>
                    <a
                      href={`/s/${page.shareToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, fontSize: 10.5 }}
                    >
                      <ExternalLink size={10} /> View
                    </a>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', borderTop: '1px solid hsl(var(--rule-ghost))' }}>
                <Link
                  to={`/pages/${page._id}`}
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, justifyContent: 'center', gap: 4, borderRadius: 0 }}
                >
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
          ))}
        </div>
      )}

      {/* ── Published device shares ── */}
      {deviceShares.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Published device shares</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {deviceShares.map((share: any) => (
              <div key={share._id} className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '18px 20px 14px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Smartphone size={13} style={{ color: 'hsl(var(--muted-fg))' }} />
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1 }}>
                        {share.label || share.resourceId || 'Device share'}
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--good))' }}>
                      <Globe size={10} /> Live
                    </span>
                  </div>
                  <div className="mono faint" style={{ fontSize: 10 }}>
                    Sections: {(share.sections ?? []).join(', ')} · {timeAgo(share.createdAt)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      onClick={() => copyShareLink(share.token)}
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, fontSize: 10.5 }}
                    >
                      <Copy size={10} /> Copy link
                    </button>
                    <a
                      href={`/s/${share.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, fontSize: 10.5 }}
                    >
                      <ExternalLink size={10} /> View
                    </a>
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
            ))}
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
    </div>
  );
}
