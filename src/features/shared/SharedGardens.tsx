import { useCallback, useEffect, useState } from 'react'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Fold } from '../../components/Fold'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { hasConsent } from '../../lib/consent'
import { getState, setActiveGarden, updateGarden, useActiveGarden } from '../../lib/store'
import { canShareText, copyText, shareOrCopy } from '../../lib/shareText'
import { currentUser } from '../../lib/sync'
import { showToast } from '../../lib/toast'
import { createInvite, createSharedGarden, deleteSharedGarden, joinSharedGarden, leaveSharedGarden, listMembers, removeMember, renameMe, setMemberRole, type Member } from '../../lib/shared/api'
import { detachGarden, importSharedGarden, syncSharedGarden } from '../../lib/shared/engine'
import { ConsentDialog } from '../legal/ConsentDialog'
import { isDemoGarden } from '../settings/demo'
import type { Garden } from '../../types'

/** Ce que les autres membres voient, écrit une fois pour la boîte de partage et pour l'entrée dans un jardin. */
const WHAT_THEY_SEE =
  'Les membres voient le nom, la position et le plan du jardin, et pour chaque plante : son nom, sa place, ses notes et la personne qui s’en occupe. Ils ne voient pas vos photos, vos achats (lieu, prix) ni vos autres jardins. Chaque membre peut modifier les plantes.'

const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 30)
const cleanCode = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)
const spaced = (c: string) => (c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c)

/** « Jardin partagé » (Réglages) : partager le jardin actif, inviter par code, rejoindre, voir les membres, quitter. */
export function SharedGardensCard() {
  const garden = useActiveGarden()
  const [signedIn, setSignedIn] = useState<boolean>()
  const [dialog, setDialog] = useState<'share' | 'join' | 'consent' | undefined>()
  const [pending, setPending] = useState<'share' | 'join'>()
  useEffect(() => {
    let alive = true
    void currentUser().then((u) => alive && setSignedIn(!!u)).catch(() => alive && setSignedIn(false))
    return () => {
      alive = false
    }
  }, [])

  // L'accord « copie en ligne » est demandé avant tout envoi (le jardin partagé est aussi gardé dans la copie en ligne personnelle).
  const withConsent = (what: 'share' | 'join') => {
    if (hasConsent('sync')) setDialog(what)
    else {
      setPending(what)
      setDialog('consent')
    }
  }

  return (
    <Fold title="Jardin partagé" feat="jardin-partage">
      <p className="small muted">Jardinez à plusieurs : famille, voisins, association. Chaque personne garde le jardin sur son appareil, et les plantes se mettent à jour entre vous. Une invitation par code, pas de recherche publique.</p>
      {signedIn === false && <p className="alert small">Pour partager un jardin, connectez-vous d’abord avec votre adresse e-mail (carte « Retrouver mes jardins sur un autre appareil », juste au-dessus).</p>}
      {signedIn && garden && <ActiveGarden garden={garden} onShare={() => withConsent('share')} />}
      {signedIn && (
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" data-feat="rejoindre-jardin" onClick={() => withConsent('join')}>
            <Icon name="users" /> Rejoindre un jardin partagé
          </button>
        </div>
      )}
      {dialog === 'share' && garden && <ShareDialog garden={garden} onClose={() => setDialog(undefined)} />}
      {dialog === 'join' && <JoinDialog onClose={() => setDialog(undefined)} />}
      {dialog === 'consent' && (
        <ConsentDialog
          id="sync"
          onAccept={() => {
            setDialog(pending)
          }}
          onRefuse={() => setDialog(undefined)}
        />
      )}
    </Fold>
  )
}

function ActiveGarden({ garden, onShare }: { garden: Garden; onShare: () => void }) {
  const link = garden.shared
  if (!link) {
    if (isDemoGarden(garden)) return <p className="small muted">Le jardin d’exemple ne se partage pas : créez d’abord votre vrai jardin.</p>
    return (
      <div className="row">
        <button type="button" className="btn primary" data-feat="partager-jardin" onClick={onShare}>
          <Icon name="users" /> Partager « {garden.name} »
        </button>
      </div>
    )
  }
  return <SharedPanel garden={garden} />
}

function SharedPanel({ garden }: { garden: Garden }) {
  const link = garden.shared!
  const admin = link.role === 'admin'
  const [members, setMembers] = useState<Member[]>()
  const [error, setError] = useState<string>()
  const [code, setCode] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'delete' | { remove: Member } | undefined>()
  const [renaming, setRenaming] = useState(false)

  const load = useCallback(async () => {
    try {
      setMembers(await listMembers(link.id))
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Les membres n’ont pas pu être chargés.')
    }
  }, [link.id])
  useEffect(() => {
    void load()
  }, [load])

  async function act(f: () => Promise<void>, ok?: string) {
    setBusy(true)
    try {
      await f()
      if (ok) showToast({ message: ok })
      await load()
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Cela n’a pas pu se faire. Réessayez dans un instant.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function invite() {
    await act(async () => {
      setCode(await createInvite(link.id))
    })
  }
  async function syncNow() {
    setBusy(true)
    const r = await syncSharedGarden(garden)
    setBusy(false)
    if (r.kind === 'error') showToast({ message: r.message, tone: 'error' })
    else if (r.kind === 'left') {
      detachGarden(garden)
      showToast({ message: 'Vous n’êtes plus dans ce jardin partagé. Il reste sur cet appareil.' })
    } else showToast({ message: 'Le jardin partagé est à jour.' })
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p>
        <strong>« {garden.name} »</strong> est partagé. Vous y êtes {admin ? 'responsable' : 'membre'}.
      </p>
      {error && <p className="alert small" role="alert">{error}</p>}
      {members && (
        <ul className="list" aria-label="Membres du jardin">
          {members.map((m) => (
            <li key={m.userId} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span style={{ minWidth: 0 }}>
                <strong>{m.displayName}</strong>
                {m.me && <span className="muted small"> (vous)</span>}
                <span className="badge" style={{ marginLeft: 6 }}>{m.role === 'admin' ? 'Responsable' : 'Membre'}</span>
              </span>
              {admin && !m.me && (
                <span className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn small" disabled={busy} onClick={() => void act(() => setMemberRole(link.id, m.userId, m.role === 'admin' ? 'member' : 'admin'))}>
                    {m.role === 'admin' ? 'Plus responsable' : 'Nommer responsable'}
                  </button>
                  <button type="button" className="btn small ghost" disabled={busy} aria-label={`Retirer ${m.displayName} du jardin`} onClick={() => setConfirm({ remove: m })}>
                    Retirer
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {admin && (
          <button type="button" className="btn primary" data-feat="inviter-jardin" disabled={busy} onClick={() => void invite()}>
            <Icon name="plus" /> Inviter quelqu’un
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => void syncNow()}>
          Mettre à jour maintenant
        </button>
      </div>
      {code && <InviteCode code={code} gardenName={garden.name} />}
      <div className="row">
        <button type="button" className="btn small" onClick={() => setRenaming(true)}>
          Changer mon nom ici
        </button>
        <button type="button" className="btn small ghost" onClick={() => setConfirm('leave')}>
          Quitter ce jardin
        </button>
        {admin && (
          <button type="button" className="btn small ghost" onClick={() => setConfirm('delete')}>
            Supprimer le jardin partagé
          </button>
        )}
      </div>
      <p className="small muted">{WHAT_THEY_SEE}</p>
      {renaming && <RenameDialog current={members?.find((m) => m.me)?.displayName ?? ''} onClose={() => setRenaming(false)} onSave={(n) => void act(() => renameMe(link.id, n), 'Nom changé.')} />}
      {confirm === 'leave' && (
        <ConfirmModal
          title="Quitter ce jardin partagé ?"
          confirmLabel="Quitter"
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => {
            setConfirm(undefined)
            void act(async () => {
              await leaveSharedGarden(link.id)
              detachGarden(garden)
            }, 'Vous avez quitté le jardin partagé. Il reste sur cet appareil.')
          }}
        >
          <p>Le jardin reste sur cet appareil, comme un jardin à vous. Les autres membres gardent le leur. Vous ne recevrez plus leurs changements.</p>
        </ConfirmModal>
      )}
      {confirm === 'delete' && (
        <ConfirmModal
          title="Supprimer le jardin partagé ?"
          confirmLabel="Supprimer en ligne"
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => {
            setConfirm(undefined)
            void act(async () => {
              await deleteSharedGarden(link.id)
              detachGarden(garden)
            }, 'Le jardin partagé est supprimé en ligne. Chaque membre garde sa copie sur son appareil.')
          }}
        >
          <p>Le jardin disparaît en ligne pour tout le monde. Chaque membre, vous compris, garde une copie sur son appareil, qui n’est plus partagée.</p>
        </ConfirmModal>
      )}
      {confirm && typeof confirm === 'object' && (
        <ConfirmModal
          title={`Retirer ${confirm.remove.displayName} ?`}
          confirmLabel="Retirer"
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => {
            const m = confirm.remove
            setConfirm(undefined)
            void act(() => removeMember(link.id, m.userId), `${m.displayName} n’est plus dans le jardin.`)
          }}
        >
          <p>Cette personne garde une copie du jardin sur son appareil, mais ne reçoit plus les changements et ne peut plus en envoyer.</p>
        </ConfirmModal>
      )}
    </div>
  )
}

function InviteCode({ code, gardenName }: { code: string; gardenName: string }) {
  const share = canShareText()
  const [manual, setManual] = useState(false)
  const text = `Rejoignez mon jardin partagé « ${gardenName} » sur PermaJardin.\nOuvrez l’appli (${location.origin}), puis Compte > Jardin partagé > Rejoindre un jardin partagé, et saisissez le code : ${spaced(code)}\nLe code est valable 7 jours.`
  async function go() {
    const r = share ? await shareOrCopy(text, 'Invitation PermaJardin') : await copyText(text)
    if (r === 'copied') showToast({ message: 'Invitation copiée. Collez-la dans un message.' })
    if (r === 'manual') setManual(true)
  }
  return (
    <div className="card" role="status" aria-label="Code d’invitation">
      <p className="small muted" style={{ margin: 0 }}>Code d’invitation (7 jours, 10 personnes au plus)</p>
      <p style={{ fontSize: 'calc(28 * var(--px))', letterSpacing: '0.12em', fontWeight: 'var(--fw-key)', margin: '4px 0' }} data-testid="invite-code">{spaced(code)}</p>
      <button type="button" className="btn" onClick={() => void go()}>
        <Icon name="users" /> {share ? 'Envoyer l’invitation' : 'Copier l’invitation'}
      </button>
      {manual && <textarea className="input" readOnly rows={4} value={text} aria-label="Invitation à copier" onFocus={(e) => e.currentTarget.select()} />}
    </div>
  )
}

function RenameDialog({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(current)
  return (
    <Modal title="Mon nom dans ce jardin" onClose={onClose} sheet>
      <div className="stack">
        <label className="field">
          <span>Un prénom ou un surnom</span>
          <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={!cleanName(name)}
          onClick={() => {
            onSave(cleanName(name))
            onClose()
          }}
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  )
}

function ShareDialog({ garden, onClose }: { garden: Garden; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function go() {
    setBusy(true)
    setError(undefined)
    try {
      const gid = await createSharedGarden(garden, cleanName(name))
      updateGarden(garden.id, { shared: { id: gid, role: 'admin' } })
      const mine = getState().gardens.find((g) => g.id === garden.id) ?? garden
      const r = await syncSharedGarden(mine)
      if (r.kind === 'error') showToast({ message: `Le jardin est partagé, mais l’envoi des plantes a échoué : ${r.message}`, tone: 'error' })
      else showToast({ message: 'Le jardin est partagé. Invitez maintenant quelqu’un.' })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Le jardin n’a pas pu être partagé.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`Partager « ${garden.name} »`} onClose={onClose} sheet>
      <div className="stack">
        <p>{WHAT_THEY_SEE}</p>
        <p className="small muted">Vous pourrez inviter des personnes avec un code, en retirer, ou quitter le jardin quand vous voulez.</p>
        <label className="field">
          <span>Votre nom dans ce jardin (un prénom ou un surnom)</span>
          <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Marie" />
        </label>
        {error && <p className="alert small" role="alert">{error}</p>}
        <button type="button" className="btn primary" disabled={busy || !cleanName(name)} onClick={() => void go()}>
          {busy && <span className="spinner" />} Partager ce jardin
        </button>
      </div>
    </Modal>
  )
}

function JoinDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function go() {
    setBusy(true)
    setError(undefined)
    try {
      const gid = await joinSharedGarden(cleanCode(code), cleanName(name))
      const r = await importSharedGarden(gid)
      if (r.garden) setActiveGarden(r.garden.id)
      if (r.error) showToast({ message: r.error, tone: 'error' })
      else showToast({ message: `Vous avez rejoint « ${r.garden?.name ?? 'le jardin'} ».` })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Le jardin n’a pas pu être rejoint.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Rejoindre un jardin partagé" onClose={onClose} sheet>
      <div className="stack">
        <p className="small muted">{WHAT_THEY_SEE}</p>
        <label className="field">
          <span>Code d’invitation</span>
          <input className="input" inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD EFGH" />
        </label>
        <label className="field">
          <span>Votre nom dans ce jardin (un prénom ou un surnom)</span>
          <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Marie" />
        </label>
        {error && <p className="alert small" role="alert">{error}</p>}
        <button type="button" className="btn primary" disabled={busy || cleanCode(code).length < 8 || !cleanName(name)} onClick={() => void go()}>
          {busy && <span className="spinner" />} Rejoindre
        </button>
      </div>
    </Modal>
  )
}
