# FairShare: Assessment Answers

## 1. Trust and balance discrepancy

I would first reproduce the number, not adjust it. FairShare calculates balances from source records, so I can trace the ৳12,000 back to its expenses, allocations, and settlements. I would check who paid each expense, whether the user was wrongly included as a participant, whether the split type and amounts were entered correctly, and whether any expense was duplicated. I would also check whether a settlement the user made is missing. The sign convention is positive means owed, negative means owes. Integer poisha and BigInt rule out rounding error as the cause. If a genuine fault is found, I would fix it at the source, add a regression test, and rely on the activity history to explain the change. I would never overwrite the balance by hand.

## 2. Multi-currency support

This would be a proposed extension, since FairShare currently handles a single currency. Before building it, I would ask whether each group uses one currency or mixes several, and whether conversion is needed at all. If it is, I need to know the exchange-rate source, when the rate is captured, and whether it is fixed at expense time. I would also ask how settlements should work across currencies. Risks include differing minor-unit precision, rounding rules, and corrupting historical records. I would not add NPR, USD, and BDT into one number, because that figure would have no meaning. Instead I would store a currency code with every amount, keep balances per currency, and extend validation, the API, UI formatting, and tests accordingly.

## 3. Performance investigation

I would measure before changing anything, separating database time, application computation, and serialization. For the database side, I would inspect the actual queries and their query plans, look for missing indexes and N+1 patterns, and check whether I am fetching more rows or columns than the balance needs. Likely improvements are selecting only required fields, aggregating in the database where it is safe, and avoiding repeated per-expense lookups. I would consider caching or a precomputed summary only if the measurements justified it, keeping expenses and settlements as the source of truth. Any change must produce identical BigInt results and settlement suggestions. I would compare before and after timings using realistic data of 40 members and 5,000 expenses. None of these optimizations are claimed as implemented.
