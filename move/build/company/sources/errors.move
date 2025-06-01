module company::errors;

// Access Control Errors
const EInvalidCap: u64 = 1;
const EDuplicate: u64 = 2;
const ENotInWhitelist: u64 = 3;
const ENoAccess: u64 = 4;

// Salary Logic Errors
const ENotWhitelisted: u64 = 101;
const EVaultNotFound: u64 = 102;
const EAlreadyClaimed: u64 = 103;
const EInsufficientDays: u64 = 104;
const EDepositExists: u64 = 105;
const ENoDeposit: u64 = 106;
const EInvalidAmount: u64 = 107;
const EEmployeeNotEligible: u64 = 108;

// Nautilus Proof Specific Errors
const EInvalidProofData: u64 = 109;
const EEmployeeNotCurrentlyEmployed: u64 = 110;
const EInsufficientWorkingDays: u64 = 111;
const EInvalidSignature: u64 = 112;
const ENotWhitelistedForDailyAccess: u64 = 113;

// Employee Log Logic Errors
const EInvalidLog: u64 = 201;
const EWorklogNotFound: u64 = 202;
const EAlreadyCheckedInToday: u64 = 203;
const ENoActiveCheckIn: u64 = 204;
const EMismatchedCheckInTime: u64 = 205;

// --- Getters for Error Codes ---
public fun invalid_cap(): u64 { EInvalidCap }
public fun duplicate(): u64 { EDuplicate }
public fun not_in_whitelist(): u64 { ENotInWhitelist }
public fun no_access(): u64 { ENoAccess }
public fun not_whitelisted(): u64 { ENotWhitelisted }
public fun vault_not_found(): u64 { EVaultNotFound }
public fun already_claimed(): u64 { EAlreadyClaimed }
public fun insufficient_days(): u64 { EInsufficientDays }
public fun deposit_exists(): u64 { EDepositExists } 
public fun no_deposit(): u64 { ENoDeposit }
public fun worklog_not_found(): u64 { EWorklogNotFound }
public fun invalid_amount(): u64 { EInvalidAmount }
public fun employee_not_eligible(): u64 { EEmployeeNotEligible }
public fun invalid_log(): u64 { EInvalidLog }
public fun already_checked_in_today(): u64 { EAlreadyCheckedInToday }
public fun no_active_check_in(): u64 { ENoActiveCheckIn }
public fun mismatched_check_in_time(): u64 { EMismatchedCheckInTime }

// Getters for Nautilus Proof Errors
public fun invalid_proof_data(): u64 { EInvalidProofData }
public fun employee_not_currently_employed(): u64 { EEmployeeNotCurrentlyEmployed }
public fun insufficient_working_days(): u64 { EInsufficientWorkingDays }
public fun invalid_signature(): u64 { EInvalidSignature }
public fun not_whitelisted_for_daily_access(): u64 { ENotWhitelistedForDailyAccess }