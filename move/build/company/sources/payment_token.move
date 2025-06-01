module company::payment_token {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Balance};
    use sui::object::{id};
    use company::events::{emit_payment_token_initialized, emit_tokens_minted, emit_tokens_burned};

    public struct PAYMENT_TOKEN has drop {}
    
    fun init(otw: PAYMENT_TOKEN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<PAYMENT_TOKEN>(
            otw,
            9,
            b"PAY",
            b"Payment Token",
            b"Token for paying for salary",
            option::none(),
            ctx
        );
        let sender = tx_context::sender(ctx);
        
        let treasury_cap_id_val = id(&treasury_cap);
        let metadata_id_val = id(&metadata);

        transfer::public_transfer(treasury_cap, sender);
        transfer::public_share_object(metadata);

        emit_payment_token_initialized(treasury_cap_id_val, metadata_id_val, sender);
    }

    // === Public Functions ===

    /// Mint new `PAYMENT_TOKEN` coins. Only the owner of `TreasuryCap<PAYMENT_TOKEN>` can call this.
    public entry fun mint(
        treasury_cap: &mut TreasuryCap<PAYMENT_TOKEN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let treasury_cap_id_val = id(treasury_cap);
        coin::mint_and_transfer(treasury_cap, amount, recipient, ctx);
        emit_tokens_minted(treasury_cap_id_val, amount, recipient);
    }

    /// Burn `PAYMENT_TOKEN` coins. Only the owner of `TreasuryCap<PAYMENT_TOKEN>` can call this.
    public entry fun burn(treasury_cap: &mut TreasuryCap<PAYMENT_TOKEN>, coin_to_burn: Coin<PAYMENT_TOKEN>) {
        let burned_value = coin::value(&coin_to_burn);
        let treasury_cap_id_val = id(treasury_cap);
        coin::burn(treasury_cap, coin_to_burn);
        emit_tokens_burned(treasury_cap_id_val, burned_value);
    }

    /// Get the total supply of `PAYMENT_TOKEN`.
    public fun total_supply(treasury_cap: &TreasuryCap<PAYMENT_TOKEN>): u64 {
        coin::total_supply(treasury_cap)
    }

    /// Get the balance of a `PAYMENT_TOKEN` coin object.
    public fun balance(coin: &Coin<PAYMENT_TOKEN>): &Balance<PAYMENT_TOKEN> {
        coin::balance(coin)
    }

    /// Get the value (amount) of a `PAYMENT_TOKEN` coin object.
    public fun value(coin: &Coin<PAYMENT_TOKEN>): u64 {
        coin::value(coin)
    }
    
    #[test_only]
    public fun destroy_for_testing(coin: Coin<PAYMENT_TOKEN>) {
        coin::burn_for_testing(coin);
    }
}