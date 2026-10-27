-- Test des règles de sécurité de public.garden_snapshots (RLS, droits, effacement).
--
-- ⚠️ À EXÉCUTER UNIQUEMENT SUR UNE BASE LOCALE JETABLE (supabase start, ou un Postgres de test), JAMAIS sur un projet réel :
-- le script crée des utilisateurs factices et efface leurs lignes.
--
-- Mode d'emploi (CLI Supabase local) :
--   supabase start && supabase db reset          # applique supabase/migrations
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f docs/securite-rls-test.sql
-- Succès = le script se termine sans erreur et affiche « OK : … » pour chaque cas.
-- Les rôles anon / authenticated et auth.uid() sont ceux de Supabase ; le jeton est simulé par request.jwt.claims.

begin;

insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');

-- Ligne de B, créée en superutilisateur.
insert into public.garden_snapshots (user_id, data)
values ('bbbbbbbb-0000-0000-0000-000000000002', '{"version":2,"gardens":[],"plants":[],"tasksDone":[]}');

-- ---- A (connecté) --------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- A ne voit pas la ligne de B
  select count(*) into n from public.garden_snapshots;
  assert n = 0, 'A voit la ligne de B';

  -- A ne peut pas écrire pour B
  begin
    insert into public.garden_snapshots (user_id, data) values ('bbbbbbbb-0000-0000-0000-000000000002', '{}');
    assert false, 'A a inséré pour B';
  exception when insufficient_privilege or unique_violation then null;
  end;

  -- A crée sa ligne
  insert into public.garden_snapshots (user_id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', '{"version":2}');
  select count(*) into n from public.garden_snapshots;
  assert n = 1, 'A ne voit pas sa propre ligne';

  -- A ne modifie ni ne supprime la ligne de B (0 ligne touchée, pas d'erreur)
  update public.garden_snapshots set data = '{"pirate":true}' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'A a modifié la ligne de B';
  delete from public.garden_snapshots where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'A a supprimé la ligne de B';

  -- A ne peut pas « donner » sa ligne à B (with check)
  begin
    update public.garden_snapshots set user_id = 'bbbbbbbb-0000-0000-0000-000000000002' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    assert false, 'A a réaffecté sa ligne à B';
  exception when insufficient_privilege then null;
  end;

  -- Le contenu doit être un objet JSON
  begin
    update public.garden_snapshots set data = '[1,2]' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    assert false, 'tableau JSON accepté';
  exception when check_violation then null;
  end;

  -- updated_at est fixé par le serveur : une valeur envoyée par le client est ignorée
  update public.garden_snapshots set updated_at = '2000-01-01' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into n from public.garden_snapshots where updated_at < now() - interval '1 day';
  assert n = 0, 'updated_at falsifiable par le client';

  -- TRUNCATE (qui ignore la RLS) est refusé
  begin
    truncate public.garden_snapshots;
    assert false, 'A a pu TRUNCATE';
  exception when insufficient_privilege then null;
  end;

  -- La fonction de déclencheur n'est pas appelable
  begin
    perform public.garden_snapshots_touch();
    assert false, 'garden_snapshots_touch appelable';
  exception when insufficient_privilege or feature_not_supported then null;
  end;

  raise notice 'OK : A est isolé de B, ne peut ni TRUNCATE ni falsifier updated_at ni user_id';
end $$;

-- ---- Anonyme (clé anon sans connexion) ---------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform count(*) from public.garden_snapshots;
    assert false, 'anon peut lire';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.garden_snapshots (user_id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', '{}');
    assert false, 'anon peut écrire';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_my_account();
    assert false, 'anon peut appeler delete_my_account';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK : anon n''accède à rien (lecture, écriture, delete_my_account)';
end $$;

-- ---- Effacement du compte --------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.delete_my_account();

reset role;
do $$
declare n int;
begin
  select count(*) into n from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert n = 0, 'le compte de A existe encore';
  select count(*) into n from public.garden_snapshots where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert n = 0, 'l''instantané de A existe encore (cascade)';
  select count(*) into n from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert n = 1, 'le compte de B a été supprimé !';
  select count(*) into n from public.garden_snapshots where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert n = 1, 'l''instantané de B a été supprimé !';
  raise notice 'OK : delete_my_account efface le compte et l''instantané de A, pas ceux de B';
end $$;

-- delete_my_account sans connexion (jeton sans sub) : refusé
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$
begin
  begin
    perform public.delete_my_account();
    assert false, 'delete_my_account sans identité';
  exception when invalid_authorization_specification then null;
  end;
  raise notice 'OK : delete_my_account exige une identité';
end $$;

-- Compte anonyme Supabase (is_anonymous = true) : ni lecture ni écriture (migration 20261027000000_snapshots_no_anonymous)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}', true);
do $$
declare n int;
begin
  select count(*) into n from public.garden_snapshots;
  assert n = 0, 'un compte anonyme lit un instantané';
  begin
    update public.garden_snapshots set data = '{"x":1}' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    assert n = 0, 'un compte anonyme modifie un instantané';
  end;
  begin
    insert into public.garden_snapshots (user_id, data) values ('cccccccc-0000-0000-0000-000000000003', '{}');
    assert false, 'un compte anonyme a inséré';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  raise notice 'OK : les comptes anonymes n''ont aucun accès à la sauvegarde';
end $$;

rollback; -- rien n'est conservé
