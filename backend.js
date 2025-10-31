// backend.js  ––  one file, four chains, free to use
import express from 'express';
import cors from 'cors';
import { Alchemy, Network } from 'alchemy-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

// ======  YOUR ADDRESSES & PRICES  ======
const ADDRESSES = {
  erc20: '0xae10abaa803153489dee70da4a7679c1da2906d0',
  bep20: '0xae10abaa803153489dee70da4a7679c1da2906d0',
  trc20: 'TFGRg4us7h3eFF7oaddefAKnzPAXX5NQKC',
  spl:   '7GpjokVaV9vqKtzTQ1UqW8CxfA4cw8sNArfEv2ERvrPs'
};
const PRO_PRICE  = 19;
const PROMAX_PRICE = 49;

// ======  HELPERS  ======
function ok(res, data={}){ return res.json({ok:true, ...data}); }
function no(res, msg='not found'){ return res.status(404).json({ok:false, msg}); }

// ======  CHECK PAYMENT ENDPOINT  ======
// Any front-end can POST {wallet, chain, tier, txid?}
app.post('/check', async (req,res)=>{
  const {wallet, chain, tier, txid} = req.body;
  const wanted = tier==='pro' ? PRO_PRICE : PROMAX_PRICE;

  try{
    let paid = false;

    // 1. ======  SOLANA SPL  ======
    if(chain==='spl'){
      const rpc = 'https://api.mainnet-beta.solana.com';
      const conn = new Connection(rpc);
      if(!txid) return no(res, 'missing txid for Solana');
      const tx = await conn.getParsedTransaction(txid);
      if(!tx) return no(res);
      const post = tx.meta?.postTokenBalances?.find(b=>b.mint==='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
      const pre  = tx.meta?.preTokenBalances?.find(b=>b.mint==='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
      const received = (Number(post?.uiTokenAmount.amount) - Number(pre?.uiTokenAmount.amount))/1e6;
      paid = received >= wanted;
    }

    // 2. ======  ETHEREUM ERC-20  ======
    if(chain==='erc20'){
      const alchemy = new Alchemy({apiKey:process.env.ALCHEMY_KEY, network:Network.ETH_MAINNET});
      const transfers = await alchemy.core.getAssetTransfers({toAddress:ADDRESSES.erc20, contractAddress:'0xdAC17F958D2ee523a2206206994597C13D831ec7', category:'erc20'});
      paid = transfers.transfers.some(t=>Number(t.value)>=wanted && t.to.toLowerCase()===wallet.toLowerCase());
    }

    // 3. ======  BSC BEP-20  ======
    if(chain==='bep20'){
      const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=0x55d398326f99059fF775485246999027B3197955&address=${wallet}&page=1&offset=5&apikey=${process.env.BSCSCAN_KEY||'freekey'}`;
      const {data} = await axios.get(url);
      paid = data.result.some(t=>Number(t.value)/1e18>=wanted && t.to.toLowerCase()===wallet.toLowerCase());
    }

    // 4. ======  TRON TRC-20  ======
    if(chain==='trc20'){
      const url = `https://api.trongrid.io/v1/accounts/${wallet}/transactions/trc20?limit=5&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
      const {data} = await axios.get(url,{headers:{Accept:'application/json'}});
      paid = data.data.some(t=>Number(t.value)/1e6>=wanted && t.to===ADDRESSES.trc20);
    }

    if(paid){
      // TODO: save to your DB / upgrade JWT here
      return ok(res, {tier, unlocked:true});
    }
    return no(res, 'payment not found');
  }catch(e){console.error(e); return no(res, 'server error');}
});

// ======  HEALTH CHECK  ======
app.get('/ping', (_,res)=>ok(res,{ping:'pong'}));

// ======  START  ======
const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=>console.log(`Backend listening on ${PORT}`));
