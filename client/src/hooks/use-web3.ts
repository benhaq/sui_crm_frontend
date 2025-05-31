import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export interface Web3Transaction {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export function useWeb3() {
  const { setWeb3Connected, setCurrentWalletAddress } = useAppStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [account, setAccount] = useState<string | null>(null);

  const connectWallet = async (): Promise<string | null> => {
    if (!window.ethereum) {
      throw new Error('MetaMask not detected. Please install MetaMask.');
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      
      if (accounts.length > 0) {
        const address = accounts[0];
        setAccount(address);
        setCurrentWalletAddress(address);
        setWeb3Connected(true);
        return address;
      }
      return null;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  const createTimesheet = async (
    name: string,
    period: string,
    startDate: string,
    endDate: string
  ): Promise<Web3Transaction> => {
    if (!window.ethereum || !account) {
      throw new Error('Wallet not connected');
    }

    try {
      // Simulate Web3 transaction for timesheet creation
      const txHash = `0x${Math.random().toString(16).substring(2, 66)}`;
      
      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        hash: txHash,
        status: 'confirmed'
      };
    } catch (error) {
      console.error('Failed to create timesheet transaction:', error);
      throw error;
    }
  };

  const claimSalary = async (
    amount: string,
    period: string
  ): Promise<Web3Transaction> => {
    if (!window.ethereum || !account) {
      throw new Error('Wallet not connected');
    }

    try {
      // Simulate Web3 transaction for salary claim
      const txHash = `0x${Math.random().toString(16).substring(2, 66)}`;
      
      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return {
        hash: txHash,
        status: 'confirmed'
      };
    } catch (error) {
      console.error('Failed to claim salary transaction:', error);
      throw error;
    }
  };

  const addEmployeeToTimesheet = async (
    employeeAddress: string,
    timesheetId: number
  ): Promise<Web3Transaction> => {
    if (!window.ethereum || !account) {
      throw new Error('Wallet not connected');
    }

    try {
      // Simulate Web3 transaction for adding employee
      const txHash = `0x${Math.random().toString(16).substring(2, 66)}`;
      
      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return {
        hash: txHash,
        status: 'confirmed'
      };
    } catch (error) {
      console.error('Failed to add employee transaction:', error);
      throw error;
    }
  };

  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({
            method: 'eth_accounts',
          });
          if (accounts.length > 0) {
            const address = accounts[0];
            setAccount(address);
            setCurrentWalletAddress(address);
            setWeb3Connected(true);
          }
        } catch (error) {
          console.error('Failed to check wallet connection:', error);
        }
      }
    };

    checkConnection();

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          const address = accounts[0];
          setAccount(address);
          setCurrentWalletAddress(address);
          setWeb3Connected(true);
        } else {
          setAccount(null);
          setCurrentWalletAddress(null);
          setWeb3Connected(false);
        }
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged');
      }
    };
  }, [setCurrentWalletAddress, setWeb3Connected]);

  return {
    account,
    isConnecting,
    connectWallet,
    createTimesheet,
    claimSalary,
    addEmployeeToTimesheet,
  };
}
