alter table public.system_users
add column if not exists password_hash text;

update public.system_users
set password_hash = 'scrypt$_OKfzrSNphauNp8uKV3mmA$cq91rny84cFyo8e_q6FOsXs06-7VHopCxnAZREDpQi-jw-dZNQ54ZjkSxZGGQq-oqMly8LOe8FrO281v7jP-0g',
    updated_at = now()
where username = 'lybkj'
  and (password_hash is null or password_hash = '');
