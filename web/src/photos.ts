// Фотографии с Unsplash (лицензия Unsplash: бесплатное использование, авторство указываем).
// Файлы лежат в web/public/photos/<ключ>.jpg, 1200×800.
export interface Photo { id: string; src: string; author: string; username: string; alt: string }

const P = (id: string, src: string, author: string, username: string, alt: string): Photo => ({ id, src, author, username, alt });

export const PHOTOS: Record<string, Photo> = {
  r1: P('poI7DelFiVA', 'photo-1517248135467-4c7edcad34c4', 'Jason Leung', 'ninjason', 'Restaurant dining room'),
  r2: P('iFyLBKmCrmQ', 'photo-1622140739492-f82f386260b5', 'Brands&People', 'brandsandpeople', 'Italian bistro tables'),
  r3: P('RxC-ffCkdDE', 'photo-1722587544083-057ef8a58925', 'Thimotius Timmy', 'thedeadvertising', 'Bright restaurant hall'),
  r4: P('pQh1curaEWY', 'photo-1722587563138-556bf8e966a9', 'Thimotius Timmy', 'thedeadvertising', 'Restaurant with plants'),
  r5: P('Y1Z8Se7kyn8', 'photo-1788999424381-b2fbb078997b', 'Ali Aziz', 'thealiaziz', 'Chef serving pizza'),
  r6: P('qmSstWh3RNc', 'photo-1760413445188-1318f64b128a', 'Ansaf Ahmad', 'shotsoftorono', 'Pizzeria at golden hour'),
  f1: P('uVjqFohje3I', 'photo-1762922425232-ab2b6b251739', 'Jessie Maxwell', 'jessiemaxwellphotography', 'Seafood pasta with wine'),
  f2: P('NKwNQpY335s', 'photo-1777333033410-4548702116af', 'Brelyn Bashrum', 'brelynkk', 'Dinner with pasta and wine'),
  f3: P('ym2l70yIUFo', 'photo-1791840183366-1585f00f8c37', 'Toa Heftiba', 'heftiba', 'Pizza, pasta and dessert'),
  f4: P('yR4mWD61rDg', 'photo-1770678724670-e96395edf4ac', 'Brelyn Bashrum', 'brelynkk', 'Salmon with pasta'),
  s1: P('EHK-EH1SRzQ', 'photo-1502364271109-0a9a75a2a9df', 'Thomas Marban', 'thomas', 'Sushi chef at work'),
  s2: P('a5ToDH34m0I', 'photo-1470256699805-a29e1b58598a', 'Alva Pratt', 'alvapratt', 'Japanese restaurant'),
  s3: P('I_sG8AZFpNs', 'photo-1648141294171-de1980517238', 'Andrea Riezzo', 'andriezzo', 'Plate of sushi'),
  p1: P('ojDzHZHcVx4', 'photo-1634324092526-91f5e878b72f', 'Eugene Krasnaok', 'krasnaok', 'Plov with meat'),
  p2: P('K7qy_rLX6_I', 'photo-1634324092536-74480096b939', 'Eugene Krasnaok', 'krasnaok', 'Plov on a colourful table'),
  p3: P('zmm--Wl0mrU', 'photo-1641893728260-19493532d6b9', 'Collab Media', 'collab_media', 'Central Asian pilaf'),
  c1: P('Kwdp-0pok-I', 'photo-1453614512568-c4024d13c247', 'Nafinia Putra', 'nputra', 'Coffee shop counter'),
  c2: P('qE1jxYXiwOA', 'photo-1521017432531-fbd92d768814', 'Petr Sevcovic', 'sevcovic23', 'People inside a cafe'),
  c3: P('2WzYHsaWyHo', 'photo-1572982270699-473dfa34d7e7', 'K8', '_k8_', 'Cafe pendant lamps'),
  b1: P('EW_rqoSdDes', 'photo-1585747860715-2ba37e788b70', 'Nathon Oski', 'onatecan', 'Barber chair'),
  b2: P('IvQeAVeJULw', 'photo-1503951914875-452162b0f3f1', 'Allef Vinicius', 'seteph', 'Barbershop client'),
  b3: P('MNu0n-3BIKs', 'photo-1621605815971-fbc98d665033', 'Andrea Donato', 'andreadonato', 'Barber tools'),
  b4: P('_25iXtaa6oY', 'photo-1596728325488-58c87691e9af', 'Antonio Reynoso', 'infantleon', 'Beard trim'),
  h1: P('Md_DhaFsnCQ', 'photo-1634449571010-02389ed0f9b0', 'Lindsay Cash', 'lindsayrc81', 'Haircut at a salon'),
  h2: P('FkAZqQJTbXM', 'photo-1580618672591-eb180b1a973f', 'Adam Winger', 'awcreativeut', 'Stylist blow-drying hair'),
  h3: P('KVVjmb3IIL8', 'photo-1595475884562-073c30d45670', 'Adam Winger', 'awcreativeut', 'Hairdressing tools'),
  sp1: P('ZbzYDboN7fg', 'photo-1600334089648-b0d9d3028eb2', 'engin akyurt', 'enginakyurt', 'Hot stone massage'),
  sp2: P('0MoF-Fe0w0A', 'photo-1515377905703-c4788e51af15', 'Christin Hume', 'christinhumephoto', 'Massage oil'),
  sp3: P('cU53ZFBr3lk', 'photo-1544161515-4ab6ce6db874', 'alan caishan', 'caishan119', 'Spa massage'),
  sp4: P('WAm_HaI4W2E', 'photo-1598901986949-f593ff2a31a6', 'Katherine Hanlon', 'tinymountain', 'Face massage in warm light'),
  d1: P('e7MJLM5VGjY', 'photo-1629909613654-28e377c37b09', 'Benyamin Bohlouli', 'benyamin_bohlouli', 'Modern dental office'),
  d2: P('8BkF0sTC6Uo', 'photo-1606811971618-4486d14f3f99', 'Caroline LM', 'carocaro1987', 'Dental exam'),
  d3: P('XJptUS8nbhs', 'photo-1598256989800-fe5f95da9787', 'Atikah Akhtar', 'atikahakhtar', 'Dental chair'),
  ho1: P('Yrxr3bsPdS0', 'photo-1618773928121-c32242e63f39', 'Vojtech Bruzek', 'vojtechbruzek', 'Hotel room bed'),
  ho2: P('T5pL6ciEn-I', 'photo-1611892440504-42a792e24d32', 'visualsofdana', 'visualsofdana', 'Hotel bedroom'),
  ho3: P('_pPHgeHz1uk', 'photo-1551882547-ff40c63fe5fa', 'Valeriia Bugaiova', 'bugaiova_valeriya', 'Hotel pool'),
  ho4: P('oxeCZrodz78', 'photo-1631049307264-da0ec9d70304', 'Point3D Commercial Imaging Ltd.', '3dottawa', 'Bright hotel suite'),
  ho5: P('5BV56SdvLmo', 'photo-1631049552057-403cdb8f0658', 'Point3D Commercial Imaging Ltd.', '3dottawa', 'Hotel room interior'),
  t1: P('WqI-PbYugn4', 'photo-1554068865-24cecd4e34b8', 'Moises Alex', 'arnok', 'Tennis player'),
  t2: P('Z4Sxy1_3wdY', 'flagged/photo-1576972405668-2d020a01cbfa', 'J. Schiemann', 'bvp', 'Doubles tennis match'),
  t3: P('MLU_X1d3ofQ', 'photo-1545809074-59472b3f5ecc', 'Renith R', 'renithr17', 'Tennis ball and racket'),
  y1: P('UxkcSzRWM2s', 'photo-1599901860904-17e6ed7083a0', 'Ginny Rose Stewart', 'ginnyrose', 'Yoga stretch'),
  y2: P('t1NEMSm1rgI', 'photo-1552196563-55cd4e45efb3', 'Dane Wetton', 'danewett', 'Yoga class'),
  y3: P('YJdCZba0TYE', 'photo-1588286840104-8957b019727f', 'Dylan Gillis', 'mainermedia', 'Yoga studio'),
  w1: P('yWwob8kwOCk', 'photo-1497366754035-f200968a6e72', 'Nastuh Abootalebi', 'sunday_digital', 'Office hallway'),
  w2: P('p_kICQCOM4s', 'photo-1604328698692-f76ea9498e76', 'Copernico', 'copernicowork', 'Coworking lounge'),
  w3: P('wawEfYdpkag', 'photo-1556761175-4b46a572b786', 'Austin Distel', 'austindistel', 'Working at a desk'),
  j1: P('dBWvUqBoOU8', 'photo-1415201364774-f6f0bb35f28f', 'Jens Thekkeveettil', 'jensth', 'Saxophone player'),
  j2: P('FU1KddSIIR4', 'photo-1541804627596-3b5b9ef58c93', 'Alex Zamora', 'chamocois', 'Jazz night band'),
  j3: P('z_disLOcoKM', 'photo-1725830071503-d705ef4a0975', 'Denny Müller', 'redaquamedia', 'Saxophone in a dark room'),
};

export const photoUrl = (key: string) => `/photos/${key}.jpg`;
export const authorUrl = (p: Photo) => `https://unsplash.com/@${p.username}?utm_source=qwerttclients&utm_medium=referral`;
export const UNSPLASH_URL = 'https://unsplash.com/?utm_source=qwerttclients&utm_medium=referral';
