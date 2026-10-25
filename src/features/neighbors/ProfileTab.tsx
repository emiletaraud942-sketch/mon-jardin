import { useMemo, useState } from 'react'
import { deleteMyAccount, listBlocks, signOut, unblockUser } from '../../lib/neighbors/api'
import { CONDUCT_RULES, neighborhoodText } from '../../lib/neighbors/logic'
import { forgetVisit, notifyNewsChanged } from '../../lib/neighbors/news'
import type { Profile } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import type { Garden } from '../../types'
import { Confirm, ErrorBox, Spinner } from './common'
import { errorText, useLoad } from './hooks'
import { Notifications } from './Notifications'
import { ProfileForm } from './ProfileForm'

export function ProfileTab({ profile, email, garden, online, onSaved }: { profile: Profile; email: string | null; garden: Garden; online: boolean; onSaved: (p: Profile) => void }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notif, setNotif] = useState(false)
  const [signOutError, setSignOutError] = useState<string>()
  const blocks = useLoad(listBlocks, 'blocks')
  const blocked = useMemo(() => blocks.data ?? [], [blocks.data])
  const [unblockError, setUnblockError] = useState<string>()

  if (editing) {
    return (
      <ProfileForm
        initial={profile}
        garden={garden}
        online={online}
        onSaved={(p) => {
          setEditing(false)
          showToast({ message: 'Profil enregistré.' })
          onSaved(p)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }
  if (notif) return <Notifications online={online} onBack={() => setNotif(false)} />
  return (
    <div className="stack">
      <section className="card stack" aria-label="Mon profil">
        <h2>Mon profil</h2>
        <dl className="nb-dl">
          <dt>Pseudo</dt>
          <dd>
            <bdi>{profile.pseudo}</bdi>
          </dd>
          <dt>Quartier</dt>
          <dd>
            {neighborhoodText(profile.cell, garden)} <span className="small muted">(environ 1 km autour)</span>
          </dd>
          {email && (
            <>
              <dt>E-mail</dt>
              <dd>
                {email} <span className="small muted">(jamais montrée)</span>
              </dd>
            </>
          )}
        </dl>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)}>
            Modifier
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              setSignOutError(undefined)
              try {
                await signOut()
              } catch (e) {
                setSignOutError(errorText(e))
              }
            }}
          >
            Se déconnecter
          </button>
        </div>
        {signOutError && <ErrorBox message={signOutError} />}
      </section>

      <section className="card stack" aria-label="Mes notifications">
        <h3 style={{ margin: 0 }}>Mes notifications</h3>
        <p style={{ margin: 0 }}>Recevez une alerte quand un message arrive. Elle ne montre jamais le texte.</p>
        <div className="row">
          <button className="btn" onClick={() => setNotif(true)}>
            Régler mes notifications
          </button>
        </div>
      </section>

      <section className="card stack" aria-label="Personnes que vous ne voyez plus">
        <h3 style={{ margin: 0 }}>Personnes que vous ne voyez plus</h3>
        {blocks.error && <ErrorBox message={blocks.error} onRetry={blocks.reload} />}
        {unblockError && <ErrorBox message={unblockError} />}
        {blocks.loading && !blocks.data && <Spinner label="Chargement…" />}
        {blocks.data && blocked.length === 0 && <p className="muted" style={{ margin: 0 }}>Vous voyez tout le monde.</p>}
        <ul className="list">
          {blocked.map((b) => (
            <li key={b.userId} className="row" style={{ justifyContent: 'space-between' }}>
              <bdi>{b.pseudo ?? 'Ancien voisin'}</bdi>
              <button
                className="btn small tall"
                disabled={!online}
                onClick={async () => {
                  setUnblockError(undefined)
                  try {
                    await unblockUser(b.userId)
                    blocks.reload()
                  } catch (e) {
                    setUnblockError(errorText(e))
                  }
                }}
              >
                Revoir cette personne
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" aria-label="Règles de conduite">
        <h3 style={{ margin: 0 }}>Règles de conduite</h3>
        <ul className="nb-rules">
          {CONDUCT_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: 0 }}>
          Pour retirer votre autorisation : Réglages, Vie privée.
        </p>
      </section>

      <section className="card stack" aria-label="Supprimer mon compte">
        <h3 style={{ margin: 0 }}>Supprimer mon compte</h3>
        <p style={{ margin: 0 }}>Efface votre profil, vos annonces, vos photos et vos messages. Votre jardin sur cet appareil ne change pas.</p>
        <div className="row">
          <button className="btn danger" onClick={() => setDeleting(true)} disabled={!online}>
            Supprimer mon compte
          </button>
        </div>
      </section>

      {deleting && (
        <Confirm
          title="Supprimer votre compte ?"
          confirmLabel="Supprimer définitivement"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteMyAccount()
            forgetVisit(profile.userId)
            notifyNewsChanged()
            showToast({ message: 'Votre compte et vos annonces sont supprimés.' })
          }}
        >
          <p style={{ margin: 0 }}>
            Cette action est <strong>définitive</strong>. Profil, annonces, photos et messages sont effacés. Vous serez déconnecté.
          </p>
        </Confirm>
      )}
    </div>
  )
}
