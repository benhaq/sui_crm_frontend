module company::employee_log {
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use company::whitelist::{Self, Whitelist};
    use company::errors;
    use company::events::{emit_employee_check_in, emit_employee_check_out};

    const ONE_DAY_MS: u64 = 86400000; // 24 * 60 * 60 * 1000

    // Shared object to store the last check-in time for each employee
    public struct EmployeeLastCheckInLog has key {
        id: UID,
        last_check_ins: Table<address, u64> // Maps employee address to their last check-in timestamp
    }

    // Module initializer to create the shared EmployeeLastCheckInLog object
    fun init(ctx: &mut TxContext) {
        transfer::share_object(EmployeeLastCheckInLog {
            id: object::new(ctx),
            last_check_ins: table::new<address, u64>(ctx)
        });
    }

    public entry fun check_in(
        log: &mut EmployeeLastCheckInLog,
        wl: &Whitelist,
        c: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(whitelist::is_member(wl, sender), errors::not_whitelisted_for_daily_access());

        let current_timestamp_ms = clock::timestamp_ms(c);
        let current_day_epoch = current_timestamp_ms / ONE_DAY_MS;

        if (table::contains(&log.last_check_ins, sender)) {
            let last_check_in_ms = *table::borrow(&log.last_check_ins, sender);
            let last_check_in_day_epoch = last_check_in_ms / ONE_DAY_MS;
            assert!(current_day_epoch > last_check_in_day_epoch, errors::already_checked_in_today());
            
            // Modify existing record
            let stored_timestamp_ref = table::borrow_mut(&mut log.last_check_ins, sender);
            *stored_timestamp_ref = current_timestamp_ms;
        } else {
            // Add new record
            table::add(&mut log.last_check_ins, sender, current_timestamp_ms);
        };

        emit_employee_check_in(sender, current_timestamp_ms);
    }


    public entry fun check_out(
        log: &EmployeeLastCheckInLog,
        wl: &Whitelist,
        c: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(whitelist::is_member(wl, sender), errors::not_whitelisted_for_daily_access());
        assert!(table::contains(&log.last_check_ins, sender), errors::no_active_check_in());
        let recorded_check_in_time_ms = *table::borrow(&log.last_check_ins, sender);

        let check_out_timestamp = clock::timestamp_ms(c);
        assert!(check_out_timestamp > recorded_check_in_time_ms, errors::invalid_log());
        let duration_ms = check_out_timestamp - recorded_check_in_time_ms;
        
        emit_employee_check_out(sender, recorded_check_in_time_ms, check_out_timestamp, duration_ms);
    }

    // calculate_duration can remain a helper if used by check_out_and_emit or off-chain
    public fun calculate_duration_from_times(check_in: u64, check_out: u64): u64 {
        assert!(check_out > check_in, errors::invalid_log());
        check_out - check_in
    }

}