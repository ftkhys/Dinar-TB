'use strict';

const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('Tambahkan nilai berikut ke environment server (jangan commit):');
console.log(`WEB_PUSH_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${keys.privateKey}`);
console.log('WEB_PUSH_SUBJECT=mailto:alamat-admin@domain-anda');
console.log('');
console.log(
  'Public key juga boleh dikirim ke browser; private key harus tetap rahasia.',
);
