update public.products
set color_box_size = nullif(trim(regexp_replace(color_box_size, '\s*cm\s*$', '', 'i')), '')
where color_box_size ~* '\s*cm\s*$';

update public.products
set carton_spec = nullif(trim(regexp_replace(carton_spec, '\s*cm\s*$', '', 'i')), '')
where carton_spec ~* '\s*cm\s*$';
