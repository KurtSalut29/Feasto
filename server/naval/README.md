# Naval stores

The real food stores of Naval, Biliran that Feasto is set up with for testing and deployment,
instead of the made-up demo stores. **39 stores, 611 dishes.**

## Load them

```bash
# Deletes everything first (accounts, orders, photos), then creates the admin and these stores
docker compose --profile tools run --rm --build naval
# on the cloud server:
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools run --rm --build naval
```

No residents, riders or orders are created: people register those themselves.

## Sample sales history

So sales, reports, best sellers and ratings have something to show before real orders come in:

```bash
# Only adds: 24 sample residents, 6 sample riders, 30 days of finished orders and reviews
docker compose --profile tools run --rm --build history
```

The sample people's e-mails end in `@sample.feasto.com` (password `demo1234`), and every sample
order belongs to them. Running it again replaces the previous sample history and touches nothing
else. Run it again before a presentation to bring the 30 days up to today.

## Store log-ins

Every store can log in with its e-mail below and the `STORE_PASSWORD` from `.env`
(`demo1234` if it isn't set). Change the password before handing a store to someone.

| Store | Type | Log-in | Dishes | Check |
|---|---|---|---:|---|
| Dayka Bakeshop | Bakery | `dayka@feasto.com` | 17 |  |
| Sophia's Bread & Pastries | Bakery | `sophias@feasto.com` | 5 |  |
| TJ Breadhaus and Cafe | Bakery | `tj@feasto.com` | 7 |  |
| Purple Yam Naval | Desserts | `purple-yam@feasto.com` | 3 |  |
| Belle's Cakes and Pastries | Desserts | `belles@feasto.com` | 3 |  |
| JAM JAY JABBY Eatery | Carinderia | `jam-jay@feasto.com` | 10 | 10 estimated prices |
| Antonio's Travelers Eatery | Carinderia | `antonios@feasto.com` | 10 | 10 estimated prices |
| Marb Marb Eatery | Carinderia | `marb-marb@feasto.com` | 12 | 12 estimated prices |
| Kunis Eatery | Carinderia | `kunis@feasto.com` | 9 | 9 estimated prices |
| Big Bu Meals And Snacks | Carinderia | `big-bu@feasto.com` | 7 |  |
| Paul & Beth Eatery | Home kitchen | `paul-beth@feasto.com` | 10 |  |
| Marelous Eatery | Home kitchen | `marelous@feasto.com` | 8 |  |
| Cusina De Salas | Restaurant | `cusina-de-salas@feasto.com` | 15 |  |
| El Pomar Bistro Café | Restaurant | `el-pomar@feasto.com` | 8 |  |
| Diovanni's Pizza House | Restaurant | `diovannis@feasto.com` | 3 |  |
| MAREOLA Filipino Resto | Restaurant | `mareola@feasto.com` | 29 |  |
| D'Adaone Bar and Restaurant | Restaurant | `dadaone@feasto.com` | 45 |  |
| Khloe Cafeteria + Café | Restaurant | `khloe@feasto.com` | 15 |  |
| Talyer Belly | Restaurant | `talyer-belly@feasto.com` | 1 | 1 estimated prices |
| Jelo's Place | Restaurant | `jelos-place@feasto.com` | 20 | address and pin to confirm |
| Rabak Food Station | Restaurant | `rabak@feasto.com` | 19 | address and pin to confirm |
| Rallion's | Restaurant | `rallions@feasto.com` | 20 | address and pin to confirm |
| Jollibee Naval | Fast food | `jollibee@feasto.com` | 20 |  |
| McDonald's Naval | Fast food | `mcdonalds@feasto.com` | 16 |  |
| Mang Inasal Naval | Fast food | `mang-inasal@feasto.com` | 18 |  |
| Weluisa Food Court | Fast food | `weluisa@feasto.com` | 18 |  |
| Cloud Burger Pitstop | Fast food | `cloud-burger@feasto.com` | 19 |  |
| Lub Dub Café | Café | `lub-dub@feasto.com` | 34 |  |
| Forever Café & Lounge | Café | `forever@feasto.com` | 28 |  |
| Backyard Brews Café | Café | `backyard-brews@feasto.com` | 37 |  |
| Juanita's Café | Café | `juanitas@feasto.com` | 27 |  |
| La Maison Café | Café | `la-maison@feasto.com` | 20 | hours not published |
| JUSA's Tropical Smoothie Café | Café | `jusas@feasto.com` | 22 | hours not published |
| Max Café | Café | `max-cafe@feasto.com` | 13 | address and pin to confirm, hours not published |
| Cup Stop | Milk tea & drinks | `cup-stop@feasto.com` | 9 |  |
| Sebu Cha Milk Tea Station | Milk tea & drinks | `sebu-cha@feasto.com` | 13 | hours not published |
| Lushan Tea | Milk tea & drinks | `lushan@feasto.com` | 16 | address and pin to confirm, hours not published |
| Street Bites Snack Bar | Snacks & street food | `street-bites@feasto.com` | 10 | address and pin to confirm, hours not published |
| J&A Snack Corner | Snacks & street food | `ja-snack@feasto.com` | 15 | address and pin to confirm, hours not published |

## Where the data came from

- `web/public/Feasto_Categories`: the .docx files with names, descriptions, addresses, hours and menu
  tables, the logos (used as cover photos) and the dish photos.
- `source/menus.txt`: menus typed out by hand from the menu-board photos (D'Adaone, Mareola, Jollibee,
  McDonald's, Mang Inasal, the cafés, the milk tea and snack stores). Prices are what the photos showed;
  stores change them often, so each store should check its own menu.
- **Estimated prices**: the four carinderia menus (JAM JAY JABBY, Antonio's, Marb Marb, Kunis) had no
  prices, so they use typical Naval carinderia prices (₱15–₱60), taken from the carinderias that did
  list prices. Talyer Belly's lechon belly (₱180 per ¼ kg) is estimated too.
- **Map pins** come from the Plus Codes in the files where there was one (e.g. `H96V+74J`), otherwise
  from the street. Seven stores had no address at all and sit near the town centre: their owners
  should set the pin in Store settings.
- Hours past midnight (Cloud Burger, McDonald's) are cut at 11:59 PM, since a store's hours are one
  span within a day.
- Left out: supermarkets, the public market and the meat shop (not food stores), and stores with no
  menu in the files (A&J Snacks, Panny's, K's Silog, Q$T Banana Cue, ATO Café).
- No business permits are attached; the stores are created already approved.

## Rebuild after editing

Edit `source/menus.txt` (one dish per line: `Section|Name|Price|Description`) or the .docx files, then:

```bash
pip install python-docx Pillow openlocationcode
python server/naval/source/build_naval.py
```

It rewrites `stores.json` and `photos/` (photos are shrunk to at most 1000 px).
