// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Based on the allowlist pattern

module company::whitelist {
    use std::string::String;
    use company::utils::is_prefix;
    use company::errors;
    use sui::dynamic_field as df;

    public struct Whitelist has key {
        id: UID,
        name: String,
        list: vector<address>,
    }

    public struct Cap has key {
        id: UID,
        allowlist_id: ID,
    }

    const MARKER: u64 = 3;

    //////////////////////////////////////////
    /////// Simple allowlist with an admin cap

    /// Create an allowlist with an admin cap.
    /// The associated key-ids are [pkg id]::[allowlist id][nonce] for any nonce (thus
    /// many key-ids can be created for the same allowlist).
    public fun create_allowlist(name: String, ctx: &mut TxContext): Cap {
        let whitelist = Whitelist {
            id: object::new(ctx),
            list: vector::empty(),
            name: name,
        };
        let cap = Cap {
            id: object::new(ctx),
            allowlist_id: object::id(&whitelist),
        };
        transfer::share_object(whitelist);
        cap
    }

    public fun is_member(allowlist: &Whitelist, account: address): bool {
        allowlist.list.contains(&account)
    }

    // convenience function to create a allowlist and send it back to sender (simpler ptb for cli)
    entry fun create_allowlist_entry(name: String, ctx: &mut TxContext) {
        transfer::transfer(create_allowlist(name, ctx), ctx.sender());
    }

    public fun add(allowlist: &mut Whitelist, cap: &Cap, account: address) {
        assert!(cap.allowlist_id == object::id(allowlist), errors::invalid_cap());
        assert!(!allowlist.list.contains(&account), errors::duplicate());
        allowlist.list.push_back(account);
    }

    public fun remove(allowlist: &mut Whitelist, cap: &Cap, account: address) {
        assert!(cap.allowlist_id == object::id(allowlist), errors::invalid_cap());
        allowlist.list = allowlist.list.filter!(|x| x != account); // TODO: more efficient impl?
    }

    

    //////////////////////////////////////////////////////////
    /// Access control
    /// key format: [pkg id]::[allowlist id][random nonce]
    /// (Alternative key format: [pkg id]::[creator address][random nonce] - see private_data.move)

    public fun namespace(allowlist: &Whitelist): vector<u8> {
        allowlist.id.to_bytes()
    }

    /// All allowlisted addresses can access all IDs with the prefix of the allowlist
    fun approve_internal(caller: address, id: vector<u8>, allowlist: &Whitelist): bool {
        // Check if the id has the right prefix
        let namespace = namespace(allowlist);
        if (!is_prefix(namespace, id)) {
            return false
        };

        // Check if user is in the allowlist
        allowlist.list.contains(&caller)
    }

    entry fun seal_approve(id: vector<u8>, allowlist: &Whitelist, ctx: &TxContext) {
        assert!(approve_internal(ctx.sender(), id, allowlist), errors::no_access());
    }

    public fun add_log_marker(allowlist: &mut Whitelist, cap: &Cap, blob_id: String) {
        assert!(cap.allowlist_id == object::id(allowlist), errors::invalid_cap());
        df::add(&mut allowlist.id, blob_id, MARKER);
    }


    #[test_only]
    public fun new_allowlist_for_testing(ctx: &mut TxContext): Whitelist {
        use std::string::utf8;

        Whitelist {
            id: object::new(ctx),
            name: utf8(b"test"),
            list: vector::empty(),
        }
    }

    #[test_only]
    public fun new_cap_for_testing(ctx: &mut TxContext, allowlist: &Whitelist): Cap {
        Cap {
            id: object::new(ctx),
            allowlist_id: object::id(allowlist),
        }
    }

    #[test_only]
    public fun destroy_for_testing(allowlist: Whitelist, cap: Cap) {
        let Whitelist { id, .. } = allowlist;
        object::delete(id);
        let Cap { id, .. } = cap;
        object::delete(id);
    }
}


