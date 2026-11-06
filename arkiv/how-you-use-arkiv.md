# How NeverDown uses Arkiv

1. Seed capability offers (C5)
2. Query offers by category + max price
3. Select the cheapest valid offer
4. Resolve seller identity via ENS
5. Run PoC
6. Authorize purchase under policy
7. Install a standby endpoint

Key fields:
- `pricetinybars`
- `sellerens`
- `payto`
- `serviceurl`
- `category`
- `expiresat`
