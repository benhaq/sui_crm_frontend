module company::events;

use sui::event;

public struct SalaryVaultCreated has copy, drop {
    vault_id: ID,
    month: u64,
    year: u64,
    initial_balance: u64,
    timestamp: u64,
}

public struct SalaryClaimed has copy, drop {
    vault_id: ID,
    employee: address,
    amount_claimed: u64,
    month: u64,
    year: u64,
    timestamp: u64,
}

public struct FundsWithdrawn has copy, drop {
    vault_id: ID,
    owner: address,
    amount_withdrawn: u64,
    timestamp: u64,
}

public struct PaymentTokenInitialized has copy, drop {
    treasury_cap_id: ID,
    metadata_id: ID,
    admin_address: address,
}

public struct TokensMinted has copy, drop {
    treasury_cap_id: ID,
    amount: u64,
    recipient: address,
}

public struct TokensBurned has copy, drop {
    treasury_cap_id: ID,
    amount_burned: u64,
}

public struct WhitelistCreated has copy, drop {
    whitelist_id: ID,
    initial_user_count: u64,
}

// Event struct for check-in
public struct EmployeeCheckInEvent has copy, drop {
    employee: address,
    check_in_time: u64,
    // You might add a unique request_id or correlation_id generated off-chain if needed
}

// Event struct for check-out
public struct EmployeeCheckOutEvent has copy, drop {
    employee: address, // Or an identifier for the log being checked out against
    check_in_time: u64, // To help correlate with the check-in
    check_out_time: u64,
    duration: u64,
}

public fun emit_payment_token_initialized(treasury_cap_id: ID, metadata_id: ID, admin_address: address) {
    event::emit(PaymentTokenInitialized {
        treasury_cap_id: treasury_cap_id,
        metadata_id: metadata_id,
        admin_address: admin_address,
    });
}

public fun emit_tokens_minted(treasury_cap_id: ID, amount: u64, recipient: address) {
    event::emit(TokensMinted {
        treasury_cap_id: treasury_cap_id,
        amount: amount,
        recipient: recipient,
    });
}

public fun emit_employee_check_in(employee: address, check_in_time: u64) {
    event::emit(EmployeeCheckInEvent {
        employee: employee,
        check_in_time: check_in_time,
    });
}

public fun emit_employee_check_out(employee: address, check_in_time: u64, check_out_time: u64, duration: u64) {
    event::emit(EmployeeCheckOutEvent {
        employee: employee,
        check_in_time: check_in_time,
        check_out_time: check_out_time,
        duration: duration,
    });
}

public fun emit_tokens_burned(treasury_cap_id: ID, amount_burned: u64) {
    event::emit(TokensBurned {
        treasury_cap_id: treasury_cap_id,
        amount_burned: amount_burned,
    });
}

public fun emit_salary_vault_created(vault_id: ID, month: u64, year: u64, initial_balance: u64, timestamp: u64) {
    event::emit(SalaryVaultCreated {
        vault_id,
        month,
        year,
        initial_balance,
        timestamp,
    });
}

public fun emit_salary_claimed(vault_id: ID, employee: address, amount: u64, month: u64, year: u64, timestamp: u64) {
     event::emit(SalaryClaimed {
            vault_id: vault_id,
            employee: employee,
            amount_claimed: amount,
            month: month,
            year: year,
            timestamp: timestamp,
        });
}

public fun emit_funds_withdrawn(vault_id: ID, owner: address, amount: u64, timestamp: u64) {
    event::emit(FundsWithdrawn {
        vault_id: vault_id,
        owner: owner,
        amount_withdrawn: amount,
        timestamp: timestamp,
    });
}

public fun emit_whitelist_created(whitelist_id: ID, initial_user_count: u64) {
    event::emit(WhitelistCreated {
        whitelist_id: whitelist_id,
        initial_user_count: initial_user_count,
    });
}