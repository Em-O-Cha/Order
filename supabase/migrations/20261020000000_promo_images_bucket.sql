-- Public images for promo LINE cards (uploaded from the Members LINE admin via Apps Script with the secret key).
-- Public read only; no insert/update policies, so only the service key can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promo-images', 'promo-images', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
