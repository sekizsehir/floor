// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Sepolia WETH: 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9

interface IERC721Like {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
}

contract flooordotfun {
    address payable private owner;
    bool private locked;
    address public immutable WETH;

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    uint256 public constant rBLOCKS = 60 minutes;
    uint256 public constant sDURATION = 40 minutes;
    address public constant collectionId = 0x8f634c49BAC5b027FCa8482222421A4adC3F54ec;
    IERC721Like private constant nft = IERC721Like(collectionId);

    uint256 public minbidAM = 10 ** 8;
    uint256 public activebidAM;
    address public activeBidder;
    uint8 public minBidIncrementPercentage = 2;
    uint256 public poolAccrued;

    uint256 public epochId;
    mapping(uint256 => uint256) public epochStartById;
    mapping(bytes32 => bool) private _signed;
    mapping(bytes32 => bool) private _claimed;
    mapping(uint256 => uint256) public partCount;
    mapping(uint256 => uint256) public poolSnap;
    mapping(uint256 => uint256) public claimedCount;
    mapping(bytes32 => uint256) private _signedTokenOf;
    uint256 private lastEpochRoll;

    event BidPlaced(address indexed bidder, uint256 amount, address indexed refunded, uint256 refundAmount);
    event SaleSettled(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 amount);
    event Staked(address indexed user, uint256 indexed tokenId, uint256 epochStart);
    event Claimed(address indexed user, uint256 epochStart, uint256 share);

    constructor(address _weth) {
        require(_weth != address(0), "zero weth");
        owner = payable(msg.sender);
        WETH = _weth;
    }

    modifier nonReentrant() {
        require(!locked, "Reentrancy");
        locked = true;
        _;
        locked = false;
    }

    modifier onlyNFTOwnerWrite(uint256 tokenId) {
        require(nft.ownerOf(tokenId) == msg.sender, "Not owner of tokenId");
        require(nft.balanceOf(msg.sender) == 1, "Must hold exactly 1 NFT");
        _;
    }

    function _safeTransferETHWithFallback(address to, uint256 amount) private {
        if (amount == 0 || to == address(0)) return;
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) {
            IWETH(WETH).deposit{value: amount}();
            bool ok = IWETH(WETH).transfer(to, amount);
            require(ok, "WETH transfer failed");
        }
    }

    function _placeBid() private {
        require(msg.sender != owner, "Owner cannot bid");
        uint256 requiredBid = activebidAM == 0
            ? minbidAM
            : activebidAM + (activebidAM * minBidIncrementPercentage) / 100;
        require(msg.value >= requiredBid, "Bid too low");

        uint256 prevAmt = activebidAM;
        address prevBidder = activeBidder;

        activebidAM = msg.value;
        activeBidder = msg.sender;

        if (prevBidder != address(0) && prevAmt != 0) {
            _safeTransferETHWithFallback(prevBidder, prevAmt);
        }

        emit BidPlaced(msg.sender, msg.value, prevBidder, prevAmt);
    }

    function signOrClaim(uint256 tokenId) external nonReentrant onlyNFTOwnerWrite(tokenId) {
        uint256 modTime = block.timestamp % rBLOCKS;
        uint256 epochStart = block.timestamp - modTime;

        if (epochStart > lastEpochRoll) {
            if (lastEpochRoll != 0 && poolSnap[lastEpochRoll] > 0 && partCount[lastEpochRoll] > 0) {
                uint256 perShare = poolSnap[lastEpochRoll] / partCount[lastEpochRoll];
                uint256 distributed = perShare * claimedCount[lastEpochRoll];
                uint256 leftover = poolSnap[lastEpochRoll] - distributed;
                if (leftover > 0) {
                    poolAccrued += leftover;
                }
            }
            lastEpochRoll = epochStart;
            epochStartById[epochId] = epochStart;
            epochId += 1;
        }

        bytes32 kAddr = keccak256(abi.encodePacked("A", epochStart, msg.sender));
        bytes32 kTok = keccak256(abi.encodePacked("T", epochStart, tokenId));
        bytes32 kClm = keccak256(abi.encodePacked("C", epochStart, msg.sender));

        if (modTime < sDURATION) {
            require(!_signed[kAddr], "already signed");
            require(!_signed[kTok], "token used");

            _signed[kAddr] = true;
            _signed[kTok] = true;
            _signedTokenOf[kAddr] = tokenId;
            unchecked {
                partCount[epochStart] += 1;
            }

            emit Staked(msg.sender, tokenId, epochStart);
            return;
        }

        if (poolSnap[epochStart] == 0 && poolAccrued > 0 && partCount[epochStart] > 0) {
            poolSnap[epochStart] = poolAccrued;
            poolAccrued = 0;
        }

        require(_signed[kAddr], "not signed");
        require(!_claimed[kClm], "already claimed");
        require(_signedTokenOf[kAddr] == tokenId, "wrong token for claim");
        uint256 n = partCount[epochStart];
        require(n > 0, "no participants");

        uint256 share = poolSnap[epochStart] / n;
        require(share > 0, "zero share");

        _claimed[kClm] = true;
        claimedCount[epochStart] += 1;

        _safeTransferETHWithFallback(msg.sender, share);
        emit Claimed(msg.sender, epochStart, share);
    }

    receive() external payable nonReentrant {
        _placeBid();
    }

    fallback() external payable {
        revert("Use receive()");
    }

    function placeBid() external payable nonReentrant {
        _placeBid();
    }

    function sellToHighest(uint256 tokenId) external nonReentrant onlyNFTOwnerWrite(tokenId) {
        require(activeBidder != address(0) && activebidAM >= minbidAM, "No active bid");
        require(activeBidder != msg.sender, "You cannot sell to yourself");

        bool approved = (
            nft.getApproved(tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this))
        );
        require(approved, "Approve token to contract first");

        uint256 price = activebidAM;
        address buyer = activeBidder;
        address seller = msg.sender;

        uint256 fee = (price * 500) / 10_000;
        uint256 platformCut = fee / 10;
        uint256 poolCut = fee - platformCut;
        uint256 sellerPayout = price - fee;

        nft.safeTransferFrom(seller, buyer, tokenId);

        activebidAM = 0;
        activeBidder = address(0);

        _safeTransferETHWithFallback(seller, sellerPayout);
        if (platformCut > 0) {
            _safeTransferETHWithFallback(owner, platformCut);
        }
        poolAccrued += poolCut;

        emit SaleSettled(seller, buyer, tokenId, price);
    }

    function lockedETH() public view returns (uint256) {
        uint256 lockedTotal = activebidAM + poolAccrued;
        if (lastEpochRoll != 0 && poolSnap[lastEpochRoll] > 0 && partCount[lastEpochRoll] > 0) {
            uint256 perShare = poolSnap[lastEpochRoll] / partCount[lastEpochRoll];
            uint256 distributed = perShare * claimedCount[lastEpochRoll];
            if (poolSnap[lastEpochRoll] > distributed) {
                lockedTotal += poolSnap[lastEpochRoll] - distributed;
            }
        }
        return lockedTotal;
    }

    function setMinBidIncrementPercentage(uint8 p) external onlyOwner {
        require(p <= 50, "too high");
        minBidIncrementPercentage = p;
    }

    function sweepERC20(address token, uint256 amt) external onlyOwner nonReentrant {
        require(token != address(0), "zero token");
        require(amt > 0, "zero amount");

        uint256 bal = IERC20Minimal(token).balanceOf(address(this));
        require(bal >= amt, "insufficient token balance");

        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, owner, amt));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "sweep fail");
    }

    function sweepETH(uint256 amt) external onlyOwner nonReentrant {
        require(amt > 0, "zero amount");
        uint256 reserved = lockedETH();
        require(address(this).balance > reserved, "no excess ETH");
        require(amt <= address(this).balance - reserved, "cannot sweep locked funds");

        (bool ok, ) = owner.call{value: amt}("");
        require(ok, "sweep fail");
    }

    function currentEpochStart() public view returns (uint256) {
        uint256 modTime = block.timestamp % rBLOCKS;
        return block.timestamp - modTime;
    }

    function currentEpochId() public view returns (uint256) {
        return currentEpochStart() / rBLOCKS;
    }

    function nextMinBid() external view returns (uint256) {
        return activebidAM == 0
            ? minbidAM
            : activebidAM + (activebidAM * minBidIncrementPercentage) / 100;
    }

    function isSignPhase() public view returns (bool) {
        return (block.timestamp % rBLOCKS) < sDURATION;
    }

    function activeVault() external view returns (uint256) {
        uint256 epochStart = currentEpochStart();
        if (!isSignPhase() && poolSnap[epochStart] > 0) {
            return poolSnap[epochStart];
        }
        return poolAccrued;
    }

    function epochShare(uint256 epochStart) public view returns (uint256) {
        uint256 n = partCount[epochStart];
        return n == 0 ? 0 : poolSnap[epochStart] / n;
    }

    function mySignedToken(uint256 epochStart, address user) public view returns (uint256) {
        bytes32 k = keccak256(abi.encodePacked("A", epochStart, user));
        return _signedTokenOf[k];
    }

    function getPhaseInfo()
        external
        view
        returns (
            string memory currentPhase,
            uint256 eid,
            uint256 elapsed,
            uint256 remaining
        )
    {
        uint256 mod = block.timestamp % rBLOCKS;
        eid = epochId;
        if (mod < sDURATION) {
            currentPhase = "SIGN";
            elapsed = mod;
            remaining = sDURATION - mod;
        } else {
            currentPhase = "CLAIM";
            elapsed = mod - sDURATION;
            remaining = rBLOCKS - mod;
        }
    }
}
