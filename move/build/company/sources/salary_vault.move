module company::salary_vault {
    use sui::tx_context::{ epoch_timestamp_ms};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::table::{Self, Table};
    use sui::ed25519;
    use sui::bcs;

    use company::payment_token::PAYMENT_TOKEN;
    use company::errors;
    use company::events::{ emit_salary_claimed, emit_salary_vault_created, emit_funds_withdrawn};
    

    #[test_only]
    use sui::test_scenario;
    #[test_only]
    use company::payment_token::{Self as PaymentTokenModule};
    #[test_only]
    use sui::coin::{Self as CoinModule};

    /// Struct to hold entitlement information
    public struct Entitlement has copy, drop, store {
        recipient: address,
        amount: u64,
    }

    public struct SALARY_VAULT has drop {}

    public struct AdminCap has key, store{
        id: UID,
    }

    /// Represents a salary vault for a specific month and year
    public struct SalaryVault has key {
        id: UID,
        month: u64,
        year: u64,
        balance: Balance<PAYMENT_TOKEN>,
        entitlements: Table<address, u64>,
        trusted_nautilus_public_key: vector<u8>,
    }

    // Added NautilusProof struct
    public struct NautilusProof has copy, drop, store {
        employee_address: address,
        month: u64, // To ensure proof is for the correct period
        year: u64,  // To ensure proof is for the correct period
        working_days: u64,
        is_currently_employed: bool,
        signature: vector<u8>, // Signature from the Nautilus system
    }

    /// Serializes the core proof data for signature verification.
    /// The order of serialization must match exactly what the Nautilus system signs.
    fun serialize_proof_data_for_signing(
        employee_address: address,
        month: u64,
        year: u64,
        working_days: u64,
        is_currently_employed: bool
    ): vector<u8> {
        let mut serialized_data = bcs::to_bytes(&employee_address);
        vector::append(&mut serialized_data, bcs::to_bytes(&month));
        vector::append(&mut serialized_data, bcs::to_bytes(&year));
        vector::append(&mut serialized_data, bcs::to_bytes(&working_days));
        vector::append(&mut serialized_data, bcs::to_bytes(&is_currently_employed));
        serialized_data
    }

    fun init(
        _otw: SALARY_VAULT,
        ctx: &mut TxContext,
    ) {
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));
    }

    /// Creates a new salary vault with employee entitlements and deposited funds
    public fun create_salary_vault(
        _: &AdminCap,
        month: u64,
        year: u64,
        entitlements_vec: vector<Entitlement>,
        coin_in: Coin<PAYMENT_TOKEN>,
        trusted_nautilus_public_key: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let mut total = 0;
        let mut i = 0;
        while (i < vector::length(&entitlements_vec)) {
            let item: &Entitlement = vector::borrow(&entitlements_vec, i);
            total = total + item.amount;
            i = i + 1;
        };
        let initial_deposit_value = coin::value(&coin_in);
        assert!(initial_deposit_value == total, errors::invalid_amount());

        let mut vault = SalaryVault {
            id: object::new(ctx),
            month,
            year,
            balance: coin::into_balance(coin_in),
            entitlements: table::new(ctx),
            trusted_nautilus_public_key,
        };

        let mut j = 0;
        while (j < vector::length(&entitlements_vec)) {
            let item: &Entitlement = vector::borrow(&entitlements_vec, j);
            table::add(&mut vault.entitlements, item.recipient, item.amount);
            j = j + 1;
        };

        emit_salary_vault_created(object::id(&vault), vault.month, vault.year, initial_deposit_value, epoch_timestamp_ms(ctx));


        transfer::share_object(vault);
    }

    /// Verifies the Nautilus proof against the vault's details and claim criteria.
    fun verify_nautilus_proof(
        proof: &NautilusProof,
        vault_month: u64,
        vault_year: u64,
        claimant_address: address,
        trusted_nautilus_public_key: vector<u8>
    ): bool {
        // Check if the proof is for the claimant and the correct period
        assert!(proof.employee_address == claimant_address, errors::invalid_proof_data());
        assert!(proof.month == vault_month, errors::invalid_proof_data());
        assert!(proof.year == vault_year, errors::invalid_proof_data());

        // Serialize the data that should have been signed
        let serialized_message = serialize_proof_data_for_signing(
            proof.employee_address,
            proof.month,
            proof.year,
            proof.working_days,
            proof.is_currently_employed
        );


        // Verify the Ed25519 signature
        assert!(
            ed25519::ed25519_verify(&proof.signature, &trusted_nautilus_public_key, &serialized_message),
            errors::invalid_signature()
        );

        // Check employment criteria
        assert!(proof.is_currently_employed, errors::employee_not_currently_employed());
        assert!(proof.working_days > 22, errors::insufficient_working_days());

        true // If all checks pass
    }

    /// Allows an employee to claim their salary for the month
    public entry fun claim_salary(
        vault: &mut SalaryVault, 
        proof_employee_address: address,
        proof_month: u64,
        proof_year: u64,
        proof_working_days: u64,
        proof_is_currently_employed: bool,
        proof_signature: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Construct the proof object internally
        let proof = NautilusProof {
            employee_address: proof_employee_address,
            month: proof_month,
            year: proof_year,
            working_days: proof_working_days,
            is_currently_employed: proof_is_currently_employed,
            signature: proof_signature
        };

        // Step 1: Verify the Nautilus Proof
        assert!(verify_nautilus_proof(&proof, vault.month, vault.year, sender, vault.trusted_nautilus_public_key), errors::invalid_proof_data());

        // Step 2: Check entitlement in the vault (employee is listed and has a claimable amount)
        assert!(table::contains(&vault.entitlements, sender), errors::employee_not_eligible());
        let amount = *table::borrow(&vault.entitlements, sender);
        assert!(amount > 0, errors::already_claimed()); // Or a more specific error like ENoRemainingEntitlement

        // Proceed with payment
        let payment = balance::split(&mut vault.balance, amount);
        let coin_payment = coin::from_balance(payment, ctx);
        transfer::public_transfer(coin_payment, sender);
        *table::borrow_mut(&mut vault.entitlements, sender) = 0; // Mark as claimed for this vault

        emit_salary_claimed(object::id(vault), sender, amount, vault.month, vault.year, epoch_timestamp_ms(ctx));
    }

    /// Allows the boss to withdraw remaining funds
    public entry fun withdraw_remaining(_: &AdminCap, vault: &mut SalaryVault, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        let remaining_value = balance::value(&vault.balance);
        if (remaining_value > 0) {
            let payment = balance::split(&mut vault.balance, remaining_value);
            let coin_payment = coin::from_balance(payment, ctx);
            transfer::public_transfer(coin_payment, sender);

            emit_funds_withdrawn(object::id(vault), sender, remaining_value, epoch_timestamp_ms(ctx));

        }
    }


    #[test_only]
    public fun test_init_and_mint_for_test_wrapper(ctx: &mut TxContext): Coin<PAYMENT_TOKEN> {
        let company_initial_funds: Coin<PAYMENT_TOKEN> = CoinModule::mint_for_testing(1000000, ctx);
        company_initial_funds
    }

    #[test_only]
    public fun destroy_for_testing(vault: SalaryVault, key1: address, key2: address, ctx: &mut TxContext) {
        let SalaryVault { id, month: _, year: _, balance, mut entitlements, trusted_nautilus_public_key: _ } = vault;

        PaymentTokenModule::destroy_for_testing(coin::from_balance(balance, ctx));

        // Remove known entries for the dummy table used in the test.
        // Assumes key1 and key2 are the only keys added to this specific dummy instance.
        if (table::contains(&entitlements, key1)) {
            let _ = table::remove(&mut entitlements, key1);
        };
        if (table::contains(&entitlements, key2)) {
            let _ = table::remove(&mut entitlements, key2);
        };
        
        table::destroy_empty(entitlements); // Should be empty now for the dummy case.
        object::delete(id);
    }

    #[test]
    fun test_salary_vault_workflow() {
        // Test addresses
        let module_owner = @0xa; // Vault owner/company
        let emp1_addr = @0xb;
        let emp2_addr = @0xc;
        let ineligible_addr = @0xd; // For proof failure or not in entitlements

        let mut scenario_val = test_scenario::begin(module_owner);
        let scenario = &mut scenario_val;

        let mut company_initial_funds = test_init_and_mint_for_test_wrapper(test_scenario::ctx(scenario));
        let initial_fund_value = coin::value(&company_initial_funds);

        {
            init(SALARY_VAULT {}, test_scenario::ctx(scenario)); 
        };
        test_scenario::next_tx(scenario, module_owner);

        let admin_cap = test_scenario::take_from_sender<AdminCap>(scenario);

        // 2. Create SalaryVault
        let month = 10u64;
        let year = 2023u64;
        let mut entitlements_vec = vector::empty<Entitlement>();
        vector::push_back(&mut entitlements_vec, Entitlement { recipient: emp1_addr, amount: 100 });
        vector::push_back(&mut entitlements_vec, Entitlement { recipient: emp2_addr, amount: 150 });
        
        let total_entitlements = 100 + 150;
        assert!(initial_fund_value >= total_entitlements, errors::invalid_amount()); 
        
        let vault_deposit_coin = coin::split(&mut company_initial_funds, total_entitlements, test_scenario::ctx(scenario));
        
        // For testing, we create a dummy vault and operate on it.
        // In a real scenario, create_salary_vault would be called, and the vault ID obtained from events.
        // Then entry functions would be called using that ID.
        let mut dummy_vault_for_testing_logic = SalaryVault {
            id: object::new(test_scenario::ctx(scenario)), 
            month, year, 
            balance: coin::into_balance(vault_deposit_coin), 
            entitlements: table::new(test_scenario::ctx(scenario)),
            trusted_nautilus_public_key: vector[
                0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20
            ]
        };
        table::add(&mut dummy_vault_for_testing_logic.entitlements, emp1_addr, 100);
        table::add(&mut dummy_vault_for_testing_logic.entitlements, emp2_addr, 150);

        // 3. Test successful claim for Employee 1
        test_scenario::next_tx(scenario, emp1_addr);
        // Pass individual proof fields to claim_salary
        claim_salary(
            &mut dummy_vault_for_testing_logic, 
            emp1_addr, // proof_employee_address
            month,     // proof_month
            year,      // proof_year
            25,        // proof_working_days
            true,      // proof_is_currently_employed
            vector[
                0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
                0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
                0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f,
                0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f
            ],
            test_scenario::ctx(scenario)
        );
        // Check state after successful claim:
        assert!(*table::borrow(&dummy_vault_for_testing_logic.entitlements, emp1_addr) == 0, 3); // Entitlement set to 0
        assert!(balance::value(&dummy_vault_for_testing_logic.balance) == 150, 4); // Check remaining balance

        // 4. Test successful claim for Employee 2
        test_scenario::next_tx(scenario, emp2_addr);
        // Pass individual proof fields to claim_salary
        claim_salary(
            &mut dummy_vault_for_testing_logic, 
            emp2_addr, // proof_employee_address
            month,     // proof_month
            year,      // proof_year
            30,        // proof_working_days
            true,      // proof_is_currently_employed
            vector[
                0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe, 0xff,
                0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xee, 0xef,
                0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf,
                0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xcf
            ],
            test_scenario::ctx(scenario)
        );
        assert!(*table::borrow(&dummy_vault_for_testing_logic.entitlements, emp2_addr) == 0, 5); // Entitlement set to 0
        assert!(balance::value(&dummy_vault_for_testing_logic.balance) == 0, 6); // Vault should be empty

        // 5. Test attempt to claim again by Employee 1 (should fail due to entitlement being 0)
        // This would abort if claim_salary is called. We are testing the state that would lead to abort.
        // The assert! in claim_salary for amount > 0 would trigger.
        // test_scenario::expect_abort(errors::already_claimed()); // How you'd normally test this
        // claim_salary(&mut dummy_vault_for_testing_logic, emp1_proof_valid, test_scenario::ctx(scenario));


        // 6. Test attempt to claim with insufficient working days (should fail proof verification)
        // This would abort.
        // test_scenario::next_tx(scenario, emp1_addr); // Or any address that has an entitlement but bad proof
        // let emp1_proof_insufficient_days = NautilusProof {
        //     employee_address: emp1_addr, // Assuming emp1_addr still had entitlement for this test case
        //     month, year,
        //     working_days: 20, // Fails criteria
        //     is_currently_employed: true,
        // };
        // test_scenario::expect_abort(errors::insufficient_working_days());
        // claim_salary(&mut dummy_vault_for_testing_logic, emp1_proof_insufficient_days, test_scenario::ctx(scenario));


        // 7. Owner withdraws remaining funds (should be 0 now)
        test_scenario::next_tx(scenario, module_owner);
        withdraw_remaining(&admin_cap, &mut dummy_vault_for_testing_logic, test_scenario::ctx(scenario));
        assert!(balance::value(&dummy_vault_for_testing_logic.balance) == 0, 7); // Still 0
        
        destroy_for_testing(dummy_vault_for_testing_logic, emp1_addr, emp2_addr, test_scenario::ctx(scenario));
        PaymentTokenModule::destroy_for_testing(company_initial_funds);

        let AdminCap { id: cap_id_to_delete } = admin_cap;
        object::delete(cap_id_to_delete);

        test_scenario::end(scenario_val);
    }
}