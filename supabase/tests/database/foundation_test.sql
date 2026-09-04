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
  not has_schema_privilege('anon', 'app', 'USAGE'),
  'anonymous role cannot resolve application tables'
);
select ok(
  not has_schema_privilege('authenticated', 'app', 'USAGE'),
  'authenticated role cannot resolve application tables'
);
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous role cannot resolve private objects'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated role cannot resolve private objects'
);

select * from finish();
rollback;
