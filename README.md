# Web3 CRM System

A decentralized workforce management system built on Sui blockchain, featuring secure time tracking, encrypted work logs, and transparent employee management.

## 🌟 Overview

Web3 CRM System is a blockchain-based employee management platform that leverages:

- **Sui Blockchain** for immutable time tracking and access control
- **Mysten Seal** for end-to-end encryption of sensitive work data
- **Walrus** for decentralized storage of encrypted work logs
- **React + TypeScript** for a modern, type-safe frontend

## 🎯 Key Features

### For Employees

- **Secure Check-in/Check-out**: On-chain time tracking with cryptographic proof
- **Encrypted Work Logs**: Work data is encrypted using Seal before storage
- **Transparent Records**: View your complete work history on-chain
- **Salary Tracking**: Monitor earnings and payment status

### For Administrators

- **Timesheet Management**: Create and manage project-specific timesheets
- **Employee Whitelist**: Control access through on-chain whitelists
- **Secure Log Access**: Decrypt and view employee work logs with proper authorization
- **Real-time Monitoring**: Track employee check-ins and work hours

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Sui Network   │────▶│  Seal (Mysten)  │────▶│     Walrus      │
│   (Contracts)   │     │  (Encryption)   │     │   (Storage)     │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         ▲                                               ▲
         │                                               │
         └───────────────────────────────────────────────┘
                              │
                    ┌─────────────────┐
                    │                 │
                    │  React Frontend │
                    │   (TypeScript)  │
                    │                 │
                    └─────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- [Sui Wallet](https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil) browser extension
- Git

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/Web3CrmSystem.git
   cd Web3CrmSystem
   ```

2. **Install dependencies**

   ```bash
   # Install client dependencies
   cd client
   npm install

   # Install server dependencies (if needed)
   cd ../server
   npm install
   ```

3. **Environment Setup**

   Create a `.env` file in the client directory:

   ```env
   VITE_NETWORK=testnet
   VITE_ADMIN_ADDRESS=0x70dac11fb5595576e1782b7396c5a2b8feecd6d1c01b7e4a2e3dd99046997a1a
   ```

4. **Run the development server**

   ```bash
   cd client
   npm run dev
   ```

   The application will be available at `http://localhost:5173`

## 🔑 Admin Access

To access the admin dashboard, you need to import the admin wallet:

**Admin Private Key:**

```
suiprivkey1qqj9qawwshpgfgr53smn6swsyl9jfg2umr5ytfgavwdv690jcdvaz3k9ulu
```

### Import Admin Wallet to Sui Wallet Extension:

1. Open Sui Wallet extension
2. Click on the menu (three lines) → "Accounts"
3. Click "Import Private Key"
4. Paste the private key above
5. Name it "Web3 CRM Admin"
6. Connect this wallet when accessing the application

**Admin Address:** `0x70dac11fb5595576e1782b7396c5a2b8feecd6d1c01b7e4a2e3dd99046997a1a`

## 📖 Usage Guide

### For Administrators

1. **Connect Wallet**: Use the admin wallet to connect
2. **Create Timesheet**:
   - Navigate to "Manage Timesheet" tab
   - Enter project name and create
3. **Add Employees**:
   - Click "Add Employee" on a timesheet
   - Enter employee's Sui address
4. **Process Work Logs**:
   - Navigate to timesheet details page
   - Paste employee-provided log markers
   - Initialize Seal session
   - Decrypt and view work logs

### For Employees

1. **Connect Wallet**: Use your Sui wallet
2. **Select Timesheet**: Choose from available timesheets
3. **Check In**: Click "Check In" to start work session
4. **Check Out**:
   - Click "Check Out" to end session
   - Copy the generated work log data
   - Provide it to your administrator
5. **View History**: See all your work records in the Work Record tab

## 🔧 Technical Details

### Smart Contracts

- **Whitelist Module**: Manages employee access control
- **Employee Log Module**: Handles check-in/check-out logic
- **Events Module**: Emits on-chain events for tracking

### Encryption Flow

1. Employee generates work log after checkout
2. Log is encrypted using Seal with a unique policy ID
3. Encrypted blob is stored on Walrus
4. Employee shares blob ID and seal policy ID with admin
5. Admin uses timesheet ownership to decrypt via `seal_approve`

### Key Technologies

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Blockchain**: Sui Network, Move smart contracts
- **Encryption**: Mysten Seal SDK
- **Storage**: Walrus decentralized storage
- **State Management**: Zustand
- **Data Fetching**: TanStack Query

## 🛠️ Development

### Project Structure

```
Web3CrmSystem/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API and blockchain services
│   │   ├── lib/          # Utilities and stores
│   │   └── hooks/        # Custom React hooks
│   └── package.json
├── contracts/             # Sui Move contracts
├── server/               # Backend API (if applicable)
└── README.md
```

### Building for Production

```bash
cd client
npm run build
```

The build output will be in `dist/` directory.

## 🐛 Troubleshooting

### Common Issues

1. **"No Walrus services configured"**

   - Ensure WALRUS_SERVICES is properly configured in `walrusService.ts`

2. **"No access to decryption keys"**

   - Admin must use the provided seal log ID from employee
   - Ensure admin has proper access to the timesheet

3. **"Transaction failed"**
   - Check wallet has sufficient SUI for gas fees
   - Ensure you're connected to the correct network (testnet)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Mysten Labs](https://mystenlabs.com/) for Sui blockchain and Seal encryption
- [Walrus](https://walrus.xyz/) for decentralized storage
- The Sui developer community

---

**Note**: This is a testnet deployment. Do not use real funds or sensitive data.
