begin;

select plan(9);

select has_schema('api_v1', 'api_v1 schema exists');
select has_schema('app', 'app schema exists');
select has_schema('private', 'private schema exists');

select ok(
  has_schema_privilege('anon', 'api_v1', 'USAGE'),
  'anonymous role can resolve explicitly granted API objects'
);
select ok(
  has_schema_privilege('authenticated', 'api_v1', 'USAGE'),
  'authenticated role can resolve explicitly granted API objects'
);

select ok(
  has_schema_privilege('anon', 'app', 'USAGE')
    and not has_schema_privilege('anon', 'app', 'CREATE'),
  'anonymous role can resolve RLS-protected invoker dependencies but cannot create app objects'
);
select ok(
  has_schema_privilege('authenticated', 'app', 'USAGE')
    and not has_schema_privilege('authenticated', 'app', 'CREATE'),
  'authenticated role can resolve RLS-protected invoker dependencies but cannot create app objects'
);
select ok(
  has_schema_privilege('anon', 'private', 'USAGE')
    and not has_schema_privilege('anon', 'private', 'CREATE'),
  'anonymous role can execute the narrow public-context policy helper but cannot create private objects'
);
select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE')
    and not has_schema_privilege('authenticated', 'private', 'CREATE'),
  'authenticated role can execute narrow policy helpers but cannot create private objects'
);

select * from finish();
rollback;
