import axios from 'axios';
import { ERC20OrderRouter__factory } from "@gelatonetwork/limit-orders-lib/dist/contracts/types/index.js"; 
import { GELATO_LIMIT_ORDERS_ERC20_ORDER_ROUTER } from "@gelatonetwork/limit-orders-lib/dist/constants/index.js";
import { ERC20__factory } from "@gelatonetwork/limit-orders-lib/dist/contracts/types/index.js";
import * as ethers from "ethers";
import {
  GelatoLimitOrders, 
} from "@gelatonetwork/limit-orders-lib";
import { ChainId } from '@godtoy/pancakeswap-sdk-v2';

const wssbsc='wss://bsc-mainnet.nodereal.io/ws/v1/ea49d5c625d34b069be219d151e4f1e8'
const rpcbsc='https://bsc-mainnet.nodereal.io/v1/ea49d5c625d34b069be219d151e4f1e8'

const provider = new ethers.providers.JsonRpcProvider(rpcbsc)  
const websocketProvider = new ethers.providers.WebSocketProvider(wssbsc) //https://dataseed1.binance.org

const chainId = ChainId.MAINNET; 
 

class PricingService {


    constructor(eventEmitter, config) {

        console.log(config);
        this.config = config;
        this.pairAddress= config.pairAddress;
        this.tokenAddresss= config.tokenAddress;
        this.quoteAddress= config.quoteTokenAddress;
        this.e = eventEmitter; 
        this.wallet = new ethers.Wallet(config.privateKey,websocketProvider);  
        this.signerOrProvider = websocketProvider.getSigner(this.wallet.address);
        this.gelatoLimitOrders = new GelatoLimitOrders(
            ChainId.MAINNET,
            this.signerOrProvider, 
            config.dexname 
          );
    }
    
    tradeEnterSignal = async (tradeSignal, config) => {
    
    }

    approveToken = async(inputAmount)=>{
        const tokenContract = await ERC20__factory.connect(this.tokenAddresss,this.signerOrProvider);
        const erc20OrderRouter = await ERC20OrderRouter__factory.connect(GELATO_LIMIT_ORDERS_ERC20_ORDER_ROUTER[56],this.signerOrProvider);
        await tokenContract.connect(this.wallet).approve(GELATO_LIMIT_ORDERS_ERC20_ORDER_ROUTER[56], inputAmount); 
    }

    getOpenOrders = async(wallet)=>{ 
        const orders =  await this.gelatoLimitOrders.getOpenOrders(wallet.address);   
        return orders; 
    }

    placeLimitOrders = async(buyLimit,sellLimit)=>{

        const minReturn = ethers.utils.parseEther("1");

        const txBuy = await this.gelatoLimitOrders.submitLimitOrder(
            this.quoteAddress,
            this.tokenAddresss,
            buyLimit,
            minReturn
          );

          const txSell = await gelatoLimitOrders.submitLimitOrder(
            this.tokenAddresss,
            this.quoteAddress,
            sellLimit,
            minReturn
          );

    }
    
    async start() {
        const wallet = this.wallet
        const config = this.config;
        const e = this.e;
        const getOpenOrders = this.getOpenOrders
        const approveToken = this.approveToken;
        const placeLimitOrders = this.placeLimitOrders;

        return setInterval(() => { 
            axios.get(`https://api.dexscreener.com/latest/dex/pairs/bsc/${this.pairAddress}`)
            .then(async function (response) {
 
                const priceData = {
                    priceNative: response.data.pair.priceNative,
                    priceUsd: response.data.pair.priceUsd,   
                }
                const ordersOpen = await getOpenOrders(wallet);

                const quantity = config.fundstoUsePerTrade/(priceData.priceNative);
                console.log((quantity).toFixed(2))
                console.log(priceData)
                if(ordersOpen.length === 0){
 
                    const buyLimit = ethers.utils.parseUnits((config.fundstoUsePerTrade/(Number(quantity.toFixed(2))*(1+config.upperRange/100))).toFixed(8)+"",18)
                    const sellLimit = ethers.utils.parseUnits((config.fundstoUsePerTrade/(Number(quantity.toFixed(2))*(1-config.lowerRange/100))).toFixed(8)+"",18) 
 

                    await approveToken(sellLimit.toString());  
                    await placeLimitOrders(buyLimit.toString(),sellLimit.toString(),quantity.toFixed(2));


                } else {
                    ordersOpen.forEach((order)=>{ 
                        this.gelatoLimitOrder.cancelLimitOrder(order,true);
                    })
                }
                 
            })
            .catch(function (error) {
                console.log(new String(error.error));
            });
             
        }, 1000)
         
    }
 


}


export default PricingService;