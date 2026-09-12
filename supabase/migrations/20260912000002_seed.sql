-- =====================================================================
-- Seed — cardápio e mesas do Buteco Seu Barba
-- Preços conforme a comanda física de setembro de 2026.
-- =====================================================================

insert into categorias (nome, destino, ordem) values
  ('Espetinhos',                'chapa',   1),
  ('Refeição de sábado',        'cozinha', 2),
  ('Caldinhos',                 'cozinha', 3),
  ('Petiscos',                  'cozinha', 4),
  ('Cerveja 600 ml',            'balcao',  5),
  ('Long neck',                 'balcao',  6),
  ('Cerveja lata',              'balcao',  7),
  ('Refrigerante',              'balcao',  8),
  ('Outras bebidas',            'balcao',  9),
  ('Bebidas alcoólicas',        'balcao', 10),
  ('Drinks',                    'balcao', 11),
  ('Acompanhamento',            'cozinha',12),
  ('Sobremesa',                 'cozinha',13),
  ('Outros',                    'balcao', 14);

insert into produtos (categoria_id, nome, observacao, preco, ordem)
select c.id, p.nome, p.obs, p.preco, p.ordem
from (values
  -- Espetinhos
  ('Espetinhos','Frango',              null,             10.00, 1),
  ('Espetinhos','Misto',               'carne + calabresa', 10.00, 2),
  ('Espetinhos','Calabresa',           null,             10.00, 3),
  ('Espetinhos','Coração',             null,             10.00, 4),
  ('Espetinhos','Tulipa',              'asa de frango',  10.00, 5),
  ('Espetinhos','Carne',               null,             12.00, 6),
  ('Espetinhos','Cupim',               null,             13.00, 7),
  ('Espetinhos','Kafta',               null,             13.00, 8),
  ('Espetinhos','Medalhão de frango',  null,             13.00, 9),
  ('Espetinhos','Medalhão bovino',     null,             14.00,10),
  ('Espetinhos','Pão de alho',         null,              9.00,11),

  ('Refeição de sábado','Feijoada individual', null,     30.00, 1),

  ('Caldinhos','Camarão ou sururu',    null,             15.00, 1),
  ('Caldinhos','Dobradinha',           null,             12.00, 2),
  ('Caldinhos','Mocotó',               null,             12.00, 3),
  ('Caldinhos','Feijoada ou macaxeira',null,             12.00, 4),

  ('Petiscos','Sarapatel grande',      null,             16.00, 1),
  ('Petiscos','Sarapatel pequeno',     null,             12.00, 2),

  ('Cerveja 600 ml','Heineken',        null,             18.00, 1),
  ('Cerveja 600 ml','Stella Artois',   null,             15.00, 2),
  ('Cerveja 600 ml','Brahma',          null,             12.00, 3),
  ('Cerveja 600 ml','Eisenbahn',       null,             10.00, 4),
  ('Cerveja 600 ml','Amstel',          null,             10.00, 5),
  ('Cerveja 600 ml','Devassa',         null,             10.00, 6),
  ('Cerveja 600 ml','Itaipava',        null,              9.00, 7),

  ('Long neck','Heineken',             null,              9.00, 1),
  ('Long neck','Heineken Zero',        null,              9.00, 2),
  ('Long neck','Amstel Ultra',         null,              9.00, 3),
  ('Long neck','Budweiser',            null,              8.00, 4),

  ('Cerveja lata','Skol / Brahma',     null,              5.00, 1),
  ('Cerveja lata','Amstel / Devassa',  null,              5.00, 2),
  ('Cerveja lata','Itaipava',          null,              5.00, 3),
  ('Cerveja lata','Brahma Zero',       null,              6.00, 4),

  ('Refrigerante','Coca-Cola KS / lata',null,             6.00, 1),
  ('Refrigerante','Coca-Cola Zero lata',null,             6.00, 2),
  ('Refrigerante','Fanta lata',        null,              6.00, 3),
  ('Refrigerante','Guaraná lata',      null,              6.00, 4),
  ('Refrigerante','Guaraná Zero',      null,              6.00, 5),
  ('Refrigerante','Schweppes',         null,              6.00, 6),

  ('Outras bebidas','Monster',         null,             14.00, 1),
  ('Outras bebidas','Red Bull',        null,             13.00, 2),
  ('Outras bebidas','H2O / Sprite Fresh', null,           7.00, 3),
  ('Outras bebidas','Suco Skinka',     '450 ml',          5.00, 4),
  ('Outras bebidas','Suco Maratá',     '200 ml',          2.50, 5),
  ('Outras bebidas','Água com gás',    null,              3.50, 6),
  ('Outras bebidas','Água sem gás',    null,              2.50, 7),

  ('Bebidas alcoólicas','Ice Kabaré',  null,             10.00, 1),
  ('Bebidas alcoólicas','Ice Smirnoff',null,             10.00, 2),
  ('Bebidas alcoólicas','Skol Beats',  null,              9.00, 3),
  ('Bebidas alcoólicas','Whisky Black & White', null,    10.00, 4),
  ('Bebidas alcoólicas','Campari',     null,             10.00, 5),
  ('Bebidas alcoólicas','Alcatrão com mel e limão', null, 8.00, 6),
  ('Bebidas alcoólicas','Montilla',    null,              6.00, 7),
  ('Bebidas alcoólicas','Vinho Reservado / Pérgola', null, 7.00, 8),
  ('Bebidas alcoólicas','Palhinha / Dreher', null,        6.00, 9),
  ('Bebidas alcoólicas','Alcatrão',    null,              6.00,10),
  ('Bebidas alcoólicas','Rabo de galo',null,              5.00,11),
  ('Bebidas alcoólicas','Cortezano tinto', null,          5.00,12),
  ('Bebidas alcoólicas','Pitú',        null,              4.00,13),
  ('Bebidas alcoólicas','Vodka Slova', null,              4.00,14),

  ('Drinks','Caipirinha',              null,              9.00, 1),
  ('Acompanhamento','Arroz',           '1 pessoa',        3.00, 1),
  ('Sobremesa','Mousse de maracujá',   null,              5.00, 1),
  ('Outros','Trident',                 null,              4.00, 1),
  ('Outros','Embalagem para levar',    null,              1.00, 2)
) as p(categoria, nome, obs, preco, ordem)
join categorias c on c.nome = p.categoria;

insert into mesas (rotulo, ordem)
select g::text, g from generate_series(1, 12) g;
insert into mesas (rotulo, ordem) values ('Balcão', 99);
