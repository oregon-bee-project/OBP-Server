#Gets a count of second-order connections for a visitation matrix. Returns -1 if no primary, 0 if no 2ndary
secConn <- function(x){
  if(mode(x)=='numeric') x <- x>0 #To logical
  a <- outer(rowSums(x),rep(1,ncol(x)))+outer(rep(1,nrow(x)),colSums(x))-2
  a[!x] <- -1 #Assign negative to absent elements
  colnames(a) <- colnames(x); rownames(a) <- rownames(x)
  a
}